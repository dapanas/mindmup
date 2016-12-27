var MAPJS = MAPJS || {};
/*global console*/
/*jshint unused:false */
var observable = function (base) {
	'use strict';
	var listeners = [], x;
	base.addEventListener = function (types, listener, priority) {
		types.split(' ').forEach(function (type) {
			if (type) {
				listeners.push({
					type: type,
					listener: listener,
					priority: priority || 0
				});
			}
		});
	};
	base.listeners = function (type) {
		return listeners.filter(function (listenerDetails) {
			return listenerDetails.type === type;
		}).map(function (listenerDetails) {
			return listenerDetails.listener;
		});
	};
	base.removeEventListener = function (type, listener) {
		listeners = listeners.filter(function (details) {
			return details.listener !== listener;
		});
	};
	base.dispatchEvent = function (type) {
		var args = Array.prototype.slice.call(arguments, 1);
		listeners
			.filter(function (listenerDetails) {
				return listenerDetails.type === type;
			})
			.sort(function (firstListenerDetails, secondListenerDetails) {
				return secondListenerDetails.priority - firstListenerDetails.priority;
			})
			.some(function (listenerDetails) {
				try {
					return listenerDetails.listener.apply(undefined, args) === false;
				} catch (e) {
					console.log('dispatchEvent failed', e, listenerDetails);
				}

			});
	};
	return base;
};
/*global MAPJS */
MAPJS.URLHelper = {
	urlPattern: /(https?:\/\/|www\.)[\w-]+(\.[\w-]+)+([\w.,!@?^=%&amp;:\/~+#-]*[\w!@?^=%&amp;\/~+#-])?/i,
	containsLink : function (text) {
		'use strict';
		return MAPJS.URLHelper.urlPattern.test(text);
	},
	getLink : function (text) {
		'use strict';
		var url = text.match(MAPJS.URLHelper.urlPattern);
		if (url && url[0]) {
			url = url[0];
			if (!/https?:\/\//i.test(url)) {
				url = 'http://' + url;
			}
		}
		return url;
	},
	stripLink : function (text) {
		'use strict';
		return text.replace(MAPJS.URLHelper.urlPattern, '');
	}
};
/*jslint eqeq: true, forin: true, nomen: true*/
/*jshint unused:false, loopfunc:true */
/*global _, MAPJS, observable*/
MAPJS.content = function (contentAggregate, sessionKey) {
	'use strict';
	var cachedId,
		invalidateIdCache = function () {
			cachedId = undefined;
		},
		maxId = function maxId(idea) {
			idea = idea || contentAggregate;
			if (!idea.ideas) {
				return parseInt(idea.id, 10) || 0;
			}
			return _.reduce(
				idea.ideas,
				function (result, subidea) {
					return Math.max(result, maxId(subidea));
				},
				parseInt(idea.id, 10) || 0
			);
		},
		nextId = function nextId(originSession) {
			originSession = originSession || sessionKey;
			if (!cachedId) {
				cachedId =  maxId();
			}
			cachedId += 1;
			if (originSession) {
				return cachedId + '.' + originSession;
			}
			return cachedId;
		},
		init = function (contentIdea, originSession) {
			if (!contentIdea.id) {
				contentIdea.id = nextId(originSession);
			} else {
				invalidateIdCache();
			}
			if (contentIdea.ideas) {
				_.each(contentIdea.ideas, function (value, key) {
					contentIdea.ideas[parseFloat(key)] = init(value, originSession);
				});
			}
			if (!contentIdea.title) {
				contentIdea.title = '';
			}
			contentIdea.containsDirectChild = contentIdea.findChildRankById = function (childIdeaId) {
				return parseFloat(
					_.reduce(
						contentIdea.ideas,
						function (res, value, key) {
							return value.id == childIdeaId ? key : res;
						},
						undefined
					)
				);
			};
			contentIdea.findSubIdeaById = function (childIdeaId) {
				var myChild = _.find(contentIdea.ideas, function (idea) {
					return idea.id == childIdeaId;
				});
				return myChild || _.reduce(contentIdea.ideas, function (result, idea) {
					return result || idea.findSubIdeaById(childIdeaId);
				}, undefined);
			};
			contentIdea.find = function (predicate) {
				var current = predicate(contentIdea) ? [_.pick(contentIdea, 'id', 'title')] : [];
				if (_.size(contentIdea.ideas) === 0) {
					return current;
				}
				return _.reduce(contentIdea.ideas, function (result, idea) {
					return _.union(result, idea.find(predicate));
				}, current);
			};
			contentIdea.getAttr = function (name) {
				if (contentIdea.attr && contentIdea.attr[name]) {
					return _.clone(contentIdea.attr[name]);
				}
				return false;
			};
			contentIdea.sortedSubIdeas = function () {
				if (!contentIdea.ideas) {
					return [];
				}
				var result = [],
					childKeys = _.groupBy(_.map(_.keys(contentIdea.ideas), parseFloat), function (key) {
						return key > 0;
					}),
					sortedChildKeys = _.sortBy(childKeys[true], Math.abs).concat(_.sortBy(childKeys[false], Math.abs));
				_.each(sortedChildKeys, function (key) {
					result.push(contentIdea.ideas[key]);
				});
				return result;
			};
			contentIdea.traverse = function (iterator, postOrder) {
				if (!postOrder) {
					iterator(contentIdea);
				}
				_.each(contentIdea.sortedSubIdeas(), function (subIdea) {
					subIdea.traverse(iterator, postOrder);
				});
				if (postOrder) {
					iterator(contentIdea);
				}
			};
			return contentIdea;
		},
		maxKey = function (kvMap, sign) {
			sign = sign || 1;
			if (_.size(kvMap) === 0) {
				return 0;
			}
			var currentKeys = _.keys(kvMap);
			currentKeys.push(0); /* ensure at least 0 is there for negative ranks */
			return _.max(_.map(currentKeys, parseFloat), function (x) {
				return x * sign;
			});
		},
		nextChildRank = function (parentIdea) {
			var newRank, counts, childRankSign = 1;
			if (parentIdea.id == contentAggregate.id) {
				counts = _.countBy(parentIdea.ideas, function (v, k) {
					return k < 0;
				});
				if ((counts['true'] || 0) < counts['false']) {
					childRankSign = -1;
				}
			}
			newRank = maxKey(parentIdea.ideas, childRankSign) + childRankSign;
			return newRank;
		},
		appendSubIdea = function (parentIdea, subIdea) {
			var rank;
			parentIdea.ideas = parentIdea.ideas || {};
			rank = nextChildRank(parentIdea);
			parentIdea.ideas[rank] = subIdea;
			return rank;
		},
		findIdeaById = function (ideaId) {
			return contentAggregate.id == ideaId ? contentAggregate : contentAggregate.findSubIdeaById(ideaId);
		},
		sameSideSiblingRanks = function (parentIdea, ideaRank) {
			return _(_.map(_.keys(parentIdea.ideas), parseFloat)).reject(function (k) {
				return k * ideaRank < 0;
			});
		},
		sign = function (number) {
			/* intentionally not returning 0 case, to help with split sorting into 2 groups */
			return number < 0 ? -1 : 1;
		},
		eventStacks = {},
		redoStacks = {},
		isRedoInProgress = false,
		batches = {},
		notifyChange = function (method, args, originSession) {
			if (originSession) {
				contentAggregate.dispatchEvent('changed', method, args, originSession);
			} else {
				contentAggregate.dispatchEvent('changed', method, args);
			}
		},
		appendChange = function (method, args, undofunc, originSession) {
			var prev;
			if (method === 'batch' || batches[originSession] || !eventStacks || !eventStacks[originSession] || eventStacks[originSession].length === 0) {
				logChange(method, args, undofunc, originSession);
				return;
			} else {
				prev = eventStacks[originSession].pop();
				if (prev.eventMethod === 'batch') {
					eventStacks[originSession].push({
						eventMethod: 'batch',
						eventArgs: prev.eventArgs.concat([[method].concat(args)]),
						undoFunction: function () {
							undofunc();
							prev.undoFunction();
						}
					});
				} else {
					eventStacks[originSession].push({
						eventMethod: 'batch',
						eventArgs: [[prev.eventMethod].concat(prev.eventArgs)].concat([[method].concat(args)]),
						undoFunction: function () {
							undofunc();
							prev.undoFunction();
						}
					});
				}
			}
			if (isRedoInProgress) {
				contentAggregate.dispatchEvent('changed', 'redo', undefined, originSession);
			} else {
				notifyChange(method, args, originSession);
				redoStacks[originSession] = [];
			}
		},
		logChange = function (method, args, undofunc, originSession) {
			var event = {eventMethod: method, eventArgs: args, undoFunction: undofunc};
			if (batches[originSession]) {
				batches[originSession].push(event);
				return;
			}
			if (!eventStacks[originSession]) {
				eventStacks[originSession] = [];
			}
			eventStacks[originSession].push(event);

			if (isRedoInProgress) {
				contentAggregate.dispatchEvent('changed', 'redo', undefined, originSession);
			} else {
				notifyChange(method, args, originSession);
				redoStacks[originSession] = [];
			}
		},
		reorderChild = function (parentIdea, newRank, oldRank) {
			parentIdea.ideas[newRank] = parentIdea.ideas[oldRank];
			delete parentIdea.ideas[oldRank];
		},
		upgrade = function (idea) {
			if (idea.style) {
				idea.attr = {};
				var collapsed = idea.style.collapsed;
				delete idea.style.collapsed;
				idea.attr.style = idea.style;
				if (collapsed) {
					idea.attr.collapsed = collapsed;
				}
				delete idea.style;
			}
			if (idea.ideas) {
				_.each(idea.ideas, upgrade);
			}
		},
		sessionFromId = function (id) {
			var dotIndex = String(id).indexOf('.');
			return dotIndex > 0 && id.substr(dotIndex + 1);
		},
		commandProcessors = {},
		configuration = {},
		uniqueResourcePostfix = '/xxxxxxxx-yxxx-yxxx-yxxx-xxxxxxxxxxxx/'.replace(/[xy]/g, function (c) {
			/*jshint bitwise: false*/
			// jscs:disable
			var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r&0x3|0x8);
			// jscs:enable
			return v.toString(16);
		}) + (sessionKey || ''),
		updateAttr = function (object, attrName, attrValue) {
			var oldAttr;
			if (!object) {
				return false;
			}
			oldAttr = _.extend({}, object.attr);
			object.attr = _.extend({}, object.attr);
			if (!attrValue || attrValue === 'false' || (_.isObject(attrValue) && _.isEmpty(attrValue))) {
				if (!object.attr[attrName]) {
					return false;
				}
				delete object.attr[attrName];
			} else {
				if (_.isEqual(object.attr[attrName], attrValue)) {
					return false;
				}
				object.attr[attrName] = JSON.parse(JSON.stringify(attrValue));
			}
			if (_.size(object.attr) === 0) {
				delete object.attr;
			}
			return function () {
				object.attr = oldAttr;
			};
		};



	contentAggregate.setConfiguration = function (config) {
		configuration = config || {};
	};
	contentAggregate.getSessionKey = function () {
		return sessionKey;
	};
	contentAggregate.nextSiblingId = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank,
			candidateSiblingRanks,
			siblingsAfter;
		if (!parentIdea) {
			return false;
		}
		currentRank = parentIdea.findChildRankById(subIdeaId);
		candidateSiblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
		siblingsAfter = _.reject(candidateSiblingRanks, function (k) {
			return Math.abs(k) <= Math.abs(currentRank);
		});
		if (siblingsAfter.length === 0) {
			return false;
		}
		return parentIdea.ideas[_.min(siblingsAfter, Math.abs)].id;
	};
	contentAggregate.sameSideSiblingIds = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank = parentIdea.findChildRankById(subIdeaId);
		return _.without(_.map(_.pick(parentIdea.ideas, sameSideSiblingRanks(parentIdea, currentRank)), function (i) {
			return i.id;
		}), subIdeaId);
	};
	contentAggregate.getAttrById = function (ideaId, attrName) {
		var idea = findIdeaById(ideaId);
		return idea && idea.getAttr(attrName);
	};
	contentAggregate.previousSiblingId = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank,
			candidateSiblingRanks,
			siblingsBefore;
		if (!parentIdea) {
			return false;
		}
		currentRank = parentIdea.findChildRankById(subIdeaId);
		candidateSiblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
		siblingsBefore = _.reject(candidateSiblingRanks, function (k) {
			return Math.abs(k) >= Math.abs(currentRank);
		});
		if (siblingsBefore.length === 0) {
			return false;
		}
		return parentIdea.ideas[_.max(siblingsBefore, Math.abs)].id;
	};
	contentAggregate.clone = function (subIdeaId) {
		var toClone = (subIdeaId && subIdeaId != contentAggregate.id && contentAggregate.findSubIdeaById(subIdeaId)) || contentAggregate;
		return JSON.parse(JSON.stringify(toClone));
	};
	contentAggregate.cloneMultiple = function (subIdeaIdArray) {
		return _.map(subIdeaIdArray, contentAggregate.clone);
	};
	contentAggregate.calculatePath = function (ideaId, currentPath, potentialParent) {
		if (contentAggregate.id == ideaId) {
			return [];
		}
		currentPath = currentPath || [contentAggregate];
		potentialParent = potentialParent || contentAggregate;
		if (potentialParent.containsDirectChild(ideaId)) {
			return currentPath;
		}
		return _.reduce(
			potentialParent.ideas,
			function (result, child) {
				return result || contentAggregate.calculatePath(ideaId, [child].concat(currentPath), child);
			},
			false
		);
	};
	contentAggregate.getSubTreeIds = function (rootIdeaId) {
		var result = [],
			collectIds = function (idea) {
				if (_.isEmpty(idea.ideas)) {
					return [];
				}
				_.each(idea.sortedSubIdeas(), function (child) {
					collectIds(child);
					result.push(child.id);
				});
			};
		collectIds(contentAggregate.findSubIdeaById(rootIdeaId) || contentAggregate);
		return result;
	};
	contentAggregate.findParent = function (subIdeaId, parentIdea) {
		parentIdea = parentIdea || contentAggregate;
		if (parentIdea.containsDirectChild(subIdeaId)) {
			return parentIdea;
		}
		return _.reduce(
			parentIdea.ideas,
			function (result, child) {
				return result || contentAggregate.findParent(subIdeaId, child);
			},
			false
		);
	};

	/**** aggregate command processing methods ****/
	contentAggregate.startBatch = function (originSession) {
		var activeSession = originSession || sessionKey;
		contentAggregate.endBatch(originSession);
		batches[activeSession] = [];
	};
	contentAggregate.endBatch = function (originSession) {
		var activeSession = originSession || sessionKey,
			inBatch = batches[activeSession],
			batchArgs,
			batchUndoFunctions,
			undo;
		batches[activeSession] = undefined;
		if (_.isEmpty(inBatch)) {
			return;
		}
		if (_.size(inBatch) === 1) {
			logChange(inBatch[0].eventMethod, inBatch[0].eventArgs, inBatch[0].undoFunction, activeSession);
		} else {
			batchArgs = _.map(inBatch, function (event) {
				return [event.eventMethod].concat(event.eventArgs);
			});
			batchUndoFunctions = _.sortBy(
				_.map(inBatch, function (event) {
					return event.undoFunction;
				}),
				function (f, idx) {
					return -1 * idx;
				}
			);
			undo = function () {
				_.each(batchUndoFunctions, function (eventUndo) {
					eventUndo();
				});
			};
			logChange('batch', batchArgs, undo, activeSession);
		}
	};
	contentAggregate.execCommand = function (cmd, args, originSession) {
		if (!commandProcessors[cmd]) {
			return false;
		}
		return commandProcessors[cmd].apply(contentAggregate, [originSession || sessionKey].concat(_.toArray(args)));
	};

	contentAggregate.batch = function (batchOp) {
		contentAggregate.startBatch();
		try {
			batchOp();
		}
		finally {
			contentAggregate.endBatch();
		}
	};

	commandProcessors.batch = function (originSession) {
		contentAggregate.startBatch(originSession);
		try {
			_.each(_.toArray(arguments).slice(1), function (event) {
				contentAggregate.execCommand(event[0], event.slice(1), originSession);
			});
		}
		finally {
			contentAggregate.endBatch(originSession);
		}
	};
	contentAggregate.pasteMultiple = function (parentIdeaId, jsonArrayToPaste) {
		contentAggregate.startBatch();
		var results = _.map(jsonArrayToPaste, function (json) {
			return contentAggregate.paste(parentIdeaId, json);
		});
		contentAggregate.endBatch();
		return results;
	};

	contentAggregate.paste = function (parentIdeaId, jsonToPaste, initialId) {
		return contentAggregate.execCommand('paste', arguments);
	};
	commandProcessors.paste = function (originSession, parentIdeaId, jsonToPaste, initialId) {
		var pasteParent = (parentIdeaId == contentAggregate.id) ?  contentAggregate : contentAggregate.findSubIdeaById(parentIdeaId),
			cleanUp = function (json) {
				var result =  _.omit(json, 'ideas', 'id', 'attr'), index = 1, childKeys, sortedChildKeys;
				result.attr = _.omit(json.attr, configuration.nonClonedAttributes);
				if (_.isEmpty(result.attr)) {
					delete result.attr;
				}
				if (json.ideas) {
					childKeys = _.groupBy(_.map(_.keys(json.ideas), parseFloat), function (key) {
						return key > 0;
					});
					sortedChildKeys = _.sortBy(childKeys[true], Math.abs).concat(_.sortBy(childKeys[false], Math.abs));
					result.ideas = {};
					_.each(sortedChildKeys, function (key) {
						result.ideas[index++] = cleanUp(json.ideas[key]);
					});
				}
				return result;
			},
			newIdea,
			newRank,
			oldPosition;
		if (initialId) {
			cachedId = parseInt(initialId, 10) - 1;
		}
		newIdea =  jsonToPaste && (jsonToPaste.title || jsonToPaste.attr) && init(cleanUp(jsonToPaste), sessionFromId(initialId));
		if (!pasteParent || !newIdea) {
			return false;
		}
		newRank = appendSubIdea(pasteParent, newIdea);
		if (initialId) {
			invalidateIdCache();
		}
		updateAttr(newIdea, 'position');
		logChange('paste', [parentIdeaId, jsonToPaste, newIdea.id], function () {
			delete pasteParent.ideas[newRank];
		}, originSession);
		return newIdea.id;
	};
	contentAggregate.flip = function (ideaId) {
		return contentAggregate.execCommand('flip', arguments);
	};
	commandProcessors.flip = function (originSession, ideaId) {
		var newRank, maxRank, currentRank = contentAggregate.findChildRankById(ideaId);
		if (!currentRank) {
			return false;
		}
		maxRank = maxKey(contentAggregate.ideas, -1 * sign(currentRank));
		newRank = maxRank - 10 * sign(currentRank);
		reorderChild(contentAggregate, newRank, currentRank);
		logChange('flip', [ideaId], function () {
			reorderChild(contentAggregate, currentRank, newRank);
		}, originSession);
		return true;
	};
	contentAggregate.initialiseTitle = function (ideaId, title) {
		return contentAggregate.execCommand('initialiseTitle', arguments);
	};
	commandProcessors.initialiseTitle = function (originSession, ideaId, title) {
		var idea = findIdeaById(ideaId), originalTitle;
		if (!idea) {
			return false;
		}
		originalTitle = idea.title;
		if (originalTitle == title) {
			return false;
		}
		idea.title = title;
		appendChange('initialiseTitle', [ideaId, title], function () {
			idea.title = originalTitle;
		}, originSession);
		return true;
	};
	contentAggregate.updateTitle = function (ideaId, title) {
		return contentAggregate.execCommand('updateTitle', arguments);
	};
	commandProcessors.updateTitle = function (originSession, ideaId, title) {
		var idea = findIdeaById(ideaId), originalTitle;
		if (!idea) {
			return false;
		}
		originalTitle = idea.title;
		if (originalTitle == title) {
			return false;
		}
		idea.title = title;
		logChange('updateTitle', [ideaId, title], function () {
			idea.title = originalTitle;
		}, originSession);
		return true;
	};
	contentAggregate.addSubIdea = function (parentId, ideaTitle, optionalNewId) {
		return contentAggregate.execCommand('addSubIdea', arguments);
	};
	commandProcessors.addSubIdea = function (originSession, parentId, ideaTitle, optionalNewId) {
		var idea, parent = findIdeaById(parentId), newRank;
		if (!parent) {
			return false;
		}
		if (optionalNewId && findIdeaById(optionalNewId)) {
			return false;
		}
		idea = init({
			title: ideaTitle,
			id: optionalNewId
		});
		newRank = appendSubIdea(parent, idea);
		logChange('addSubIdea', [parentId, ideaTitle, idea.id], function () {
			delete parent.ideas[newRank];
		}, originSession);
		return idea.id;
	};
	contentAggregate.removeMultiple = function (subIdeaIdArray) {
		contentAggregate.startBatch();
		var results = _.map(subIdeaIdArray, contentAggregate.removeSubIdea);
		contentAggregate.endBatch();
		return results;
	};
	contentAggregate.removeSubIdea = function (subIdeaId) {
		return contentAggregate.execCommand('removeSubIdea', arguments);
	};
	commandProcessors.removeSubIdea = function (originSession, subIdeaId) {
		var parent = contentAggregate.findParent(subIdeaId), oldRank, oldIdea, oldLinks;
		if (parent) {
			oldRank = parent.findChildRankById(subIdeaId);
			oldIdea = parent.ideas[oldRank];
			delete parent.ideas[oldRank];
			oldLinks = contentAggregate.links;
			contentAggregate.links = _.reject(contentAggregate.links, function (link) {
				return link.ideaIdFrom == subIdeaId || link.ideaIdTo == subIdeaId;
			});
			logChange('removeSubIdea', [subIdeaId], function () {
				parent.ideas[oldRank] = oldIdea;
				contentAggregate.links = oldLinks;
			}, originSession);
			return true;
		}
		return false;
	};
	contentAggregate.insertIntermediateMultiple = function (idArray) {
		contentAggregate.startBatch();
		var newId = contentAggregate.insertIntermediate(idArray[0]);
		_.each(idArray.slice(1), function (id) {
			contentAggregate.changeParent(id, newId);
		});
		contentAggregate.endBatch();
		return newId;
	};
	contentAggregate.insertIntermediate = function (inFrontOfIdeaId, title, optionalNewId) {
		return contentAggregate.execCommand('insertIntermediate', arguments);
	};
	commandProcessors.insertIntermediate = function (originSession, inFrontOfIdeaId, title, optionalNewId) {
		if (contentAggregate.id == inFrontOfIdeaId) {
			return false;
		}
		var childRank, oldIdea, newIdea, parentIdea = contentAggregate.findParent(inFrontOfIdeaId);
		if (!parentIdea) {
			return false;
		}
		if (optionalNewId && findIdeaById(optionalNewId)) {
			return false;
		}
		childRank = parentIdea.findChildRankById(inFrontOfIdeaId);
		if (!childRank) {
			return false;
		}
		oldIdea = parentIdea.ideas[childRank];
		newIdea = init({
			title: title,
			id: optionalNewId
		});
		parentIdea.ideas[childRank] = newIdea;
		newIdea.ideas = {
			1: oldIdea
		};
		logChange('insertIntermediate', [inFrontOfIdeaId, title, newIdea.id], function () {
			parentIdea.ideas[childRank] = oldIdea;
		}, originSession);
		return newIdea.id;
	};
	contentAggregate.changeParent = function (ideaId, newParentId) {
		return contentAggregate.execCommand('changeParent', arguments);
	};
	commandProcessors.changeParent = function (originSession, ideaId, newParentId) {
		var oldParent, oldRank, newRank, idea, parent = findIdeaById(newParentId), oldPosition;
		if (ideaId == newParentId) {
			return false;
		}
		if (!parent) {
			return false;
		}
		idea = contentAggregate.findSubIdeaById(ideaId);
		if (!idea) {
			return false;
		}
		if (idea.findSubIdeaById(newParentId)) {
			return false;
		}
		if (parent.containsDirectChild(ideaId)) {
			return false;
		}
		oldParent = contentAggregate.findParent(ideaId);
		if (!oldParent) {
			return false;
		}
		oldRank = oldParent.findChildRankById(ideaId);
		newRank = appendSubIdea(parent, idea);
		oldPosition = idea.getAttr('position');
		updateAttr(idea, 'position');
		delete oldParent.ideas[oldRank];
		logChange('changeParent', [ideaId, newParentId], function () {
			updateAttr(idea, 'position', oldPosition);
			oldParent.ideas[oldRank] = idea;
			delete parent.ideas[newRank];
		}, originSession);
		return true;
	};
	contentAggregate.mergeAttrProperty = function (ideaId, attrName, attrPropertyName, attrPropertyValue) {
		var val = contentAggregate.getAttrById(ideaId, attrName) || {};
		if (attrPropertyValue) {
			val[attrPropertyName] = attrPropertyValue;
		} else {
			delete val[attrPropertyName];
		}
		if (_.isEmpty(val)) {
			val = false;
		}
		return contentAggregate.updateAttr(ideaId, attrName, val);
	};
	contentAggregate.updateAttr = function (ideaId, attrName, attrValue) {
		return contentAggregate.execCommand('updateAttr', arguments);
	};
	commandProcessors.updateAttr = function (originSession, ideaId, attrName, attrValue) {
		var idea = findIdeaById(ideaId), undoAction;
		undoAction = updateAttr(idea, attrName, attrValue);
		if (undoAction) {
			logChange('updateAttr', [ideaId, attrName, attrValue], undoAction, originSession);
		}
		return !!undoAction;
	};
	contentAggregate.moveRelative = function (ideaId, relativeMovement) {
		var parentIdea = contentAggregate.findParent(ideaId),
			currentRank = parentIdea && parentIdea.findChildRankById(ideaId),
			siblingRanks = currentRank && _.sortBy(sameSideSiblingRanks(parentIdea, currentRank), Math.abs),
			currentIndex = siblingRanks && siblingRanks.indexOf(currentRank),
			/* we call positionBefore, so movement down is actually 2 spaces, not 1 */
			newIndex = currentIndex + (relativeMovement > 0 ? relativeMovement + 1 : relativeMovement),
			beforeSibling = (newIndex >= 0) && parentIdea && siblingRanks && parentIdea.ideas[siblingRanks[newIndex]];
		if (newIndex < 0 || !parentIdea) {
			return false;
		}
		return contentAggregate.positionBefore(ideaId, beforeSibling && beforeSibling.id, parentIdea);
	};
	contentAggregate.positionBefore = function (ideaId, positionBeforeIdeaId, parentIdea) {
		return contentAggregate.execCommand('positionBefore', arguments);
	};
	commandProcessors.positionBefore = function (originSession, ideaId, positionBeforeIdeaId, parentIdea) {
		parentIdea = parentIdea || contentAggregate;
		var newRank, afterRank, siblingRanks, candidateSiblings, beforeRank, maxRank, currentRank;
		currentRank = parentIdea.findChildRankById(ideaId);
		if (!currentRank) {
			return _.reduce(
				parentIdea.ideas,
				function (result, idea) {
					return result || commandProcessors.positionBefore(originSession, ideaId, positionBeforeIdeaId, idea);
				},
				false
			);
		}
		if (ideaId == positionBeforeIdeaId) {
			return false;
		}
		newRank = 0;
		if (positionBeforeIdeaId) {
			afterRank = parentIdea.findChildRankById(positionBeforeIdeaId);
			if (!afterRank) {
				return false;
			}
			siblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
			candidateSiblings = _.reject(_.sortBy(siblingRanks, Math.abs), function (k) {
				return Math.abs(k) >= Math.abs(afterRank);
			});
			beforeRank = candidateSiblings.length > 0 ? _.max(candidateSiblings, Math.abs) : 0;
			if (beforeRank == currentRank) {
				return false;
			}
			newRank = beforeRank + (afterRank - beforeRank) / 2;
		} else {
			maxRank = maxKey(parentIdea.ideas, currentRank < 0 ? -1 : 1);
			if (maxRank == currentRank) {
				return false;
			}
			newRank = maxRank + 10 * (currentRank < 0 ? -1 : 1);
		}
		if (newRank == currentRank) {
			return false;
		}
		reorderChild(parentIdea, newRank, currentRank);
		logChange('positionBefore', [ideaId, positionBeforeIdeaId], function () {
			reorderChild(parentIdea, currentRank, newRank);
		}, originSession);
		return true;
	};
	observable(contentAggregate);
	(function () {
		var isLinkValid = function (ideaIdFrom, ideaIdTo) {
			var isParentChild, ideaFrom, ideaTo;
			if (ideaIdFrom === ideaIdTo) {
				return false;
			}
			ideaFrom = findIdeaById(ideaIdFrom);
			if (!ideaFrom) {
				return false;
			}
			ideaTo = findIdeaById(ideaIdTo);
			if (!ideaTo) {
				return false;
			}
			isParentChild = _.find(
				ideaFrom.ideas,
				function (node) {
					return node.id === ideaIdTo;
				}
			) || _.find(
				ideaTo.ideas,
				function (node) {
					return node.id === ideaIdFrom;
				}
			);
			if (isParentChild) {
				return false;
			}
			return true;
		};
		contentAggregate.addLink = function (ideaIdFrom, ideaIdTo) {
			return contentAggregate.execCommand('addLink', arguments);
		};
		commandProcessors.addLink = function (originSession, ideaIdFrom, ideaIdTo) {
			var alreadyExists, link;
			if (!isLinkValid(ideaIdFrom, ideaIdTo)) {
				return false;
			}
			alreadyExists = _.find(
				contentAggregate.links,
				function (link) {
					return (link.ideaIdFrom === ideaIdFrom && link.ideaIdTo === ideaIdTo) || (link.ideaIdFrom === ideaIdTo && link.ideaIdTo === ideaIdFrom);
				}
			);
			if (alreadyExists) {
				return false;
			}
			contentAggregate.links = contentAggregate.links || [];
			link = {
				ideaIdFrom: ideaIdFrom,
				ideaIdTo: ideaIdTo,
				attr: {
					style: {
						color: '#FF0000',
						lineStyle: 'dashed'
					}
				}
			};
			contentAggregate.links.push(link);
			logChange('addLink', [ideaIdFrom, ideaIdTo], function () {
				contentAggregate.links.pop();
			}, originSession);
			return true;
		};
		contentAggregate.removeLink = function (ideaIdOne, ideaIdTwo) {
			return contentAggregate.execCommand('removeLink', arguments);
		};
		commandProcessors.removeLink = function (originSession, ideaIdOne, ideaIdTwo) {
			var i = 0, link;

			while (contentAggregate.links && i < contentAggregate.links.length) {
				link = contentAggregate.links[i];
				if (String(link.ideaIdFrom) === String(ideaIdOne) && String(link.ideaIdTo) === String(ideaIdTwo)) {
					contentAggregate.links.splice(i, 1);
					logChange('removeLink', [ideaIdOne, ideaIdTwo], function () {
						contentAggregate.links.push(_.clone(link));
					}, originSession);
					return true;
				}
				i += 1;
			}
			return false;
		};
		contentAggregate.getLinkAttr = function (ideaIdFrom, ideaIdTo, name) {
			var link = _.find(
				contentAggregate.links,
				function (link) {
					return link.ideaIdFrom == ideaIdFrom && link.ideaIdTo == ideaIdTo;
				}
			);
			if (link && link.attr && link.attr[name]) {
				return link.attr[name];
			}
			return false;
		};
		contentAggregate.updateLinkAttr = function (ideaIdFrom, ideaIdTo, attrName, attrValue) {
			return contentAggregate.execCommand('updateLinkAttr', arguments);
		};
		commandProcessors.updateLinkAttr = function (originSession, ideaIdFrom, ideaIdTo, attrName, attrValue) {
			var link = _.find(
				contentAggregate.links,
				function (link) {
					return link.ideaIdFrom == ideaIdFrom && link.ideaIdTo == ideaIdTo;
				}
			), undoAction;
			undoAction = updateAttr(link, attrName, attrValue);
			if (undoAction) {
				logChange('updateLinkAttr', [ideaIdFrom, ideaIdTo, attrName, attrValue], undoAction, originSession);
			}
			return !!undoAction;
		};
	}());
	/* undo/redo */
	contentAggregate.undo = function () {
		return contentAggregate.execCommand('undo', arguments);
	};
	commandProcessors.undo = function (originSession) {
		contentAggregate.endBatch();
		var topEvent;
		topEvent = eventStacks[originSession] && eventStacks[originSession].pop();
		if (topEvent && topEvent.undoFunction) {
			topEvent.undoFunction();
			if (!redoStacks[originSession]) {
				redoStacks[originSession] = [];
			}
			redoStacks[originSession].push(topEvent);
			contentAggregate.dispatchEvent('changed', 'undo', [], originSession);
			return true;
		}
		return false;
	};
	contentAggregate.redo = function () {
		return contentAggregate.execCommand('redo', arguments);
	};
	commandProcessors.redo = function (originSession) {
		contentAggregate.endBatch();
		var topEvent;
		topEvent = redoStacks[originSession] && redoStacks[originSession].pop();
		if (topEvent) {
			isRedoInProgress = true;
			contentAggregate.execCommand(topEvent.eventMethod, topEvent.eventArgs, originSession);
			isRedoInProgress = false;
			return true;
		}
		return false;
	};
	contentAggregate.storeResource = function (/*resourceBody, optionalKey*/) {
		return contentAggregate.execCommand('storeResource', arguments);
	};
	commandProcessors.storeResource = function (originSession, resourceBody, optionalKey) {
		var existingId, id,
			maxIdForSession = function () {
				if (_.isEmpty(contentAggregate.resources)) {
					return 0;
				}
				var toInt = function (string) {
						return parseInt(string, 10);
					},
					keys = _.keys(contentAggregate.resources),
					filteredKeys = sessionKey ? _.filter(keys, RegExp.prototype.test.bind(new RegExp('\\/' + sessionKey + '$'))) : keys,
					intKeys = _.map(filteredKeys, toInt);
				return _.isEmpty(intKeys) ? 0 : _.max(intKeys);
			},
			nextResourceId = function () {
				var intId = maxIdForSession() + 1;
				return intId + uniqueResourcePostfix;
			};

		if (!optionalKey && contentAggregate.resources) {
			existingId = _.find(_.keys(contentAggregate.resources), function (key) {
				return contentAggregate.resources[key] === resourceBody;
			});
			if (existingId) {
				return existingId;
			}
		}
		id = optionalKey || nextResourceId();
		contentAggregate.resources = contentAggregate.resources || {};
		contentAggregate.resources[id] = resourceBody;
		contentAggregate.dispatchEvent('resourceStored', resourceBody, id, originSession);
		return id;
	};
	contentAggregate.getResource = function (id) {
		return contentAggregate.resources && contentAggregate.resources[id];
	};
	contentAggregate.hasSiblings = function (id) {
		if (id === contentAggregate.id) {
			return false;
		}
		var parent = contentAggregate.findParent(id);
		return parent && _.size(parent.ideas) > 1;
	};
	if (contentAggregate.formatVersion != 2) {
		upgrade(contentAggregate);
		contentAggregate.formatVersion = 2;
	}
	init(contentAggregate);
	return contentAggregate;
};
/*jslint nomen: true*/
/*global _, Color, MAPJS*/
MAPJS.defaultStyles = { };
MAPJS.layoutLinks = function (idea, visibleNodes) {
	'use strict';
	var result = {};
	_.each(idea.links, function (link) {
		if (visibleNodes[link.ideaIdFrom] && visibleNodes[link.ideaIdTo]) {
			result[link.ideaIdFrom + '_' + link.ideaIdTo] = {
				ideaIdFrom: link.ideaIdFrom,
				ideaIdTo: link.ideaIdTo,
				attr: _.clone(link.attr)
			};
			//todo - clone
		}
	});
	return result;
};
MAPJS.calculateFrame = function (nodes, margin) {
	'use strict';
	margin = margin || 0;
	var result = {
		top: _.min(nodes, function (node) {
			return node.y;
		}).y - margin,
		left: _.min(nodes, function (node) {
			return node.x;
		}).x - margin
	};
	result.width = margin + _.max(_.map(nodes, function (node) {
		return node.x + node.width;
	})) - result.left;
	result.height = margin + _.max(_.map(nodes, function (node) {
		return node.y + node.height;
	})) - result.top;
	return result;
};
MAPJS.contrastForeground = function (background) {
	'use strict';
	/*jslint newcap:true*/
	var luminosity = Color(background).luminosity();
	if (luminosity < 0.5) {
		return '#EEEEEE';
	}
	if (luminosity < 0.9) {
		return '#4F4F4F';
	}
	return '#000000';
};
MAPJS.Outline = function (topBorder, bottomBorder) {
	'use strict';
	var shiftBorder = function (border, deltaH) {
		return _.map(border, function (segment) {
			return {
				l: segment.l,
				h: segment.h + deltaH
			};
		});
	};
	this.initialHeight = function () {
		return this.bottom[0].h - this.top[0].h;
	};
	this.borders = function () {
		return _.pick(this, 'top', 'bottom');
	};
	this.spacingAbove = function (outline) {
		var i = 0, j = 0, result = 0, li = 0, lj = 0;
		while (i < this.bottom.length && j < outline.top.length) {
			result = Math.max(result, this.bottom[i].h - outline.top[j].h);
			if (li + this.bottom[i].l < lj + outline.top[j].l) {
				li += this.bottom[i].l;
				i += 1;
			} else if (li + this.bottom[i].l === lj + outline.top[j].l) {
				li += this.bottom[i].l;
				i += 1;
				lj += outline.top[j].l;
				j += 1;
			} else {
				lj += outline.top[j].l;
				j += 1;
			}
		}
		return result;
	};
	this.indent = function (horizontalIndent, margin) {
		if (!horizontalIndent) {
			return this;
		}
		var top = this.top.slice(),
			bottom = this.bottom.slice(),
			vertCenter = (bottom[0].h + top[0].h) / 2;
		top.unshift({h: vertCenter - margin / 2, l: horizontalIndent});
		bottom.unshift({h: vertCenter + margin / 2, l: horizontalIndent});
		return new MAPJS.Outline(top, bottom);
	};
	this.stackBelow = function (outline, margin) {
		var spacing = outline.spacingAbove(this),
			top = MAPJS.Outline.extendBorder(outline.top, shiftBorder(this.top, spacing + margin)),
			bottom = MAPJS.Outline.extendBorder(shiftBorder(this.bottom, spacing + margin), outline.bottom);
		return new MAPJS.Outline(
			top,
			bottom
		);
	};
	this.expand = function (initialTopHeight, initialBottomHeight) {
		var topAlignment = initialTopHeight - this.top[0].h,
			bottomAlignment = initialBottomHeight - this.bottom[0].h,
			top = shiftBorder(this.top, topAlignment),
			bottom = shiftBorder(this.bottom, bottomAlignment);
		return new MAPJS.Outline(
			top,
			bottom
		);
	};
	this.insertAtStart = function (dimensions, margin) {
		var alignment = 0, //-1 * this.top[0].h - suboutlineHeight * 0.5,
			topBorder = shiftBorder(this.top, alignment),
			bottomBorder = shiftBorder(this.bottom, alignment),
			easeIn = function (border) {
				border[0].l *= 0.5;
				border[1].l += border[0].l;
			};
		topBorder[0].l += margin;
		bottomBorder[0].l += margin;
		topBorder.unshift({h: -0.5 * dimensions.height, l: dimensions.width});
		bottomBorder.unshift({h: 0.5 * dimensions.height, l: dimensions.width});
		if (topBorder[0].h > topBorder[1].h) {
			easeIn(topBorder);
		}
		if (bottomBorder[0].h < bottomBorder[1].h) {
			easeIn(bottomBorder);
		}
		return new MAPJS.Outline(topBorder, bottomBorder);
	};
	this.top = topBorder.slice();
	this.bottom = bottomBorder.slice();
};
MAPJS.Outline.borderLength = function (border) {
	'use strict';
	return _.reduce(border, function (seed, el) {
		return seed + el.l;
	}, 0);
};
MAPJS.Outline.borderSegmentIndexAt = function (border, length) {
	'use strict';
	var l = 0, i = -1;
	while (l <= length) {
		i += 1;
		if (i >= border.length) {
			return -1;
		}
		l += border[i].l;
	}
	return i;
};
MAPJS.Outline.extendBorder = function (originalBorder, extension) {
	'use strict';
	var result = originalBorder.slice(),
		origLength = MAPJS.Outline.borderLength(originalBorder),
		i = MAPJS.Outline.borderSegmentIndexAt(extension, origLength),
		lengthToCut;
	if (i >= 0) {
		lengthToCut = MAPJS.Outline.borderLength(extension.slice(0, i + 1));
		result.push({h: extension[i].h, l: lengthToCut - origLength});
		result = result.concat(extension.slice(i + 1));
	}
	return result;
};
MAPJS.Tree = function (options) {
	'use strict';
	_.extend(this, options);
	this.toLayout = function (x, y, parentId) {
		x = x || 0;
		y = y || 0;
		var result = {
			nodes: {},
			connectors: {}
		}, self;
		self = _.pick(this, 'id', 'title', 'attr', 'width', 'height', 'level');
		if (self.level === 1) {
			self.x = -0.5 * this.width;
			self.y = -0.5 * this.height;
		} else {
			self.x = x + this.deltaX || 0;
			self.y = y + this.deltaY || 0;
		}
		result.nodes[this.id] = self;
		if (parentId !== undefined) {
			result.connectors[self.id] = {
				from: parentId,
				to: self.id
			};
		}
		if (this.subtrees) {
			this.subtrees.forEach(function (t) {
				var subLayout = t.toLayout(self.x, self.y, self.id);
				_.extend(result.nodes, subLayout.nodes);
				_.extend(result.connectors, subLayout.connectors);
			});
		}
		return result;
	};
};
MAPJS.Outline.fromDimensions = function (dimensions) {
	'use strict';
	return new MAPJS.Outline([{
		h: -0.5 * dimensions.height,
		l: dimensions.width
	}], [{
		h: 0.5 * dimensions.height,
		l: dimensions.width
	}]);
};
MAPJS.calculateTree = function (content, dimensionProvider, margin, rankAndParentPredicate, level) {
	'use strict';
	var options = {
		id: content.id,
		title: content.title,
		attr: content.attr,
		deltaY: 0,
		deltaX: 0,
		level: level || 1
	},
		setVerticalSpacing = function (treeArray,  dy) {
			var i,
				tree,
				oldSpacing,
				newSpacing,
				oldPositions = _.map(treeArray, function (t) {
					return _.pick(t, 'deltaX', 'deltaY');
				}),
				referenceTree,
				alignment;
			for (i = 0; i < treeArray.length; i += 1) {
				tree = treeArray[i];
				if (tree.attr && tree.attr.position) {
					tree.deltaY = tree.attr.position[1];
					if (referenceTree === undefined || tree.attr.position[2] > treeArray[referenceTree].attr.position[2]) {
						referenceTree = i;
					}
				} else {
					tree.deltaY += dy;
				}
				if (i > 0) {
					oldSpacing = oldPositions[i].deltaY - oldPositions[i - 1].deltaY;
					newSpacing = treeArray[i].deltaY - treeArray[i - 1].deltaY;
					if (newSpacing < oldSpacing) {
						tree.deltaY += oldSpacing - newSpacing;
					}
				}
			}
			alignment =  referenceTree && (treeArray[referenceTree].attr.position[1] - treeArray[referenceTree].deltaY);
			if (alignment) {
				for (i = 0; i < treeArray.length; i += 1) {
					treeArray[i].deltaY += alignment;
				}
			}
		},
		shouldIncludeSubIdeas = function () {
			return !(_.isEmpty(content.ideas) || (content.attr && content.attr.collapsed));
		},
		includedSubIdeaKeys = function () {
			var allRanks = _.map(_.keys(content.ideas), parseFloat),
				includedRanks = rankAndParentPredicate ? _.filter(allRanks, function (rank) {
					return rankAndParentPredicate(rank, content.id);
				}) : allRanks;
			return _.sortBy(includedRanks, Math.abs);
		},
		includedSubIdeas = function () {
			var result = [];
			_.each(includedSubIdeaKeys(), function (key) {
				result.push(content.ideas[key]);
			});
			return result;
		},
		nodeDimensions = dimensionProvider(content, options.level),
		appendSubtrees = function (subtrees) {
			var suboutline, deltaHeight, subtreePosition, horizontal, treeOutline;
			_.each(subtrees, function (subtree) {
				subtree.deltaX = nodeDimensions.width + margin;
				subtreePosition = subtree.attr && subtree.attr.position && subtree.attr.position[0];
				if (subtreePosition && subtreePosition > subtree.deltaX) {
					horizontal = subtreePosition - subtree.deltaX;
					subtree.deltaX = subtreePosition;
				} else {
					horizontal = 0;
				}
				if (!suboutline) {
					suboutline = subtree.outline.indent(horizontal, margin);
				} else {
					treeOutline = subtree.outline.indent(horizontal, margin);
					deltaHeight = treeOutline.initialHeight();
					suboutline = treeOutline.stackBelow(suboutline, margin);
					subtree.deltaY = suboutline.initialHeight() - deltaHeight / 2 - subtree.height / 2;
				}
			});
			if (subtrees && subtrees.length) {
				setVerticalSpacing(subtrees, 0.5 * (nodeDimensions.height  - suboutline.initialHeight()));
				suboutline = suboutline.expand(
					subtrees[0].deltaY - nodeDimensions.height * 0.5,
					subtrees[subtrees.length - 1].deltaY + subtrees[subtrees.length - 1].height - nodeDimensions.height * 0.5
				);
			}
			options.outline = suboutline.insertAtStart(nodeDimensions, margin);
		};
	_.extend(options, nodeDimensions);
	options.outline = new MAPJS.Outline.fromDimensions(nodeDimensions);
	if (shouldIncludeSubIdeas()) {
		options.subtrees = _.map(includedSubIdeas(), function (i) {
			return MAPJS.calculateTree(i, dimensionProvider, margin, rankAndParentPredicate, options.level + 1);
		});
		if (!_.isEmpty(options.subtrees)) {
			appendSubtrees(options.subtrees);
		}
	}
	return new MAPJS.Tree(options);
};

MAPJS.calculateLayout = function (idea, dimensionProvider, margin) {
	'use strict';
	var positiveTree, negativeTree, layout, negativeLayout,
		setDefaultStyles = function (nodes) {
			_.each(nodes, function (node) {
				node.attr = node.attr || {};
				node.attr.style = _.extend({}, MAPJS.defaultStyles[(node.level === 1) ? 'root' : 'nonRoot'], node.attr.style);
			});
		},
		positive = function (rank, parentId) {
			return parentId !== idea.id || rank > 0;
		},
		negative = function (rank, parentId) {
			return parentId !== idea.id || rank < 0;
		};
	margin = margin || 20;
	positiveTree = MAPJS.calculateTree(idea, dimensionProvider, margin, positive);
	negativeTree = MAPJS.calculateTree(idea, dimensionProvider, margin, negative);
	layout = positiveTree.toLayout();
	negativeLayout = negativeTree.toLayout();
	_.each(negativeLayout.nodes, function (n) {
		n.x = -1 * n.x - n.width;
	});
	_.extend(negativeLayout.nodes, layout.nodes);
	_.extend(negativeLayout.connectors, layout.connectors);
	setDefaultStyles(negativeLayout.nodes);
	negativeLayout.links = MAPJS.layoutLinks(idea, negativeLayout.nodes);
	negativeLayout.rootNodeId = idea.id;
	return negativeLayout;
};

/*global MAPJS*/
MAPJS.MemoryClipboard = function () {
	'use strict';
	var self = this,
		clone = function (something) {
			if (!something) {
				return undefined;
			}
			return JSON.parse(JSON.stringify(something));
		},
		contents;
	self.get = function () {
		return clone(contents);
	};
	self.put = function (c) {
		contents = clone(c);
	};
};
/*global $, Hammer*/
/*jslint newcap:true*/
(function () {
	'use strict';
	$.fn.simpleDraggableContainer = function () {
		var currentDragObject,
			originalDragObjectPosition,
			container = this,
			drag = function (event) {

				if (currentDragObject && event.gesture) {
					var newpos = {
							top: Math.round(parseInt(originalDragObjectPosition.top, 10) + event.gesture.deltaY),
							left: Math.round(parseInt(originalDragObjectPosition.left, 10) + event.gesture.deltaX)
						};
					currentDragObject.css(newpos).trigger($.Event('mm:drag', {currentPosition: newpos, gesture: event.gesture}));
					if (event.gesture) {
						event.gesture.preventDefault();
					}
					return false;
				}
			},
			rollback = function (e) {
				var target = currentDragObject; // allow it to be cleared while animating
				if (target.attr('mapjs-drag-role') !== 'shadow') {
					target.animate(originalDragObjectPosition, {
						complete: function () {
							target.trigger($.Event('mm:cancel-dragging', {gesture: e.gesture}));
						},
						progress: function () {
							target.trigger('mm:drag');
						}
					});
				} else {
					target.trigger($.Event('mm:cancel-dragging', {gesture: e.gesture}));
				}
			};
		Hammer(this, {'drag_min_distance': 2});
		return this.on('mm:start-dragging', function (event) {
			if (!currentDragObject) {
				currentDragObject = $(event.relatedTarget);
				originalDragObjectPosition = {
					top: currentDragObject.css('top'),
					left: currentDragObject.css('left')
				};
				$(this).on('drag', drag);
			}
		}).on('mm:start-dragging-shadow', function (event) {
			var target = $(event.relatedTarget),
				clone = function () {
					var result = target.clone().addClass('drag-shadow').appendTo(container).offset(target.offset()).data(target.data()).attr('mapjs-drag-role', 'shadow'),
						scale = target.parent().data('scale') || 1;
					if (scale !== 0) {
						result.css({
							'transform': 'scale(' + scale + ')',
							'transform-origin': 'top left'
						});
					}
					return result;
				};
			if (!currentDragObject) {
				currentDragObject = clone();
				originalDragObjectPosition = {
					top: currentDragObject.css('top'),
					left: currentDragObject.css('left')
				};
				currentDragObject.on('mm:stop-dragging mm:cancel-dragging', function (e) {
					this.remove();
					e.stopPropagation();
					e.stopImmediatePropagation();
					var evt = $.Event(e.type, {
						gesture: e.gesture,
						finalPosition: e.finalPosition
					});
					target.trigger(evt);
				}).on('mm:drag', function (e) {
					target.trigger(e);
				});
				$(this).on('drag', drag);
			}
		}).on('dragend', function (e) {
			$(this).off('drag', drag);
			if (currentDragObject) {
				var evt = $.Event('mm:stop-dragging', {
					gesture: e.gesture,
					finalPosition: currentDragObject.offset()
				});
				currentDragObject.trigger(evt);
				if (evt.result === false) {
					rollback(e);
				}
				currentDragObject = undefined;
			}
		}).on('mouseleave', function (e) {
			if (currentDragObject) {
				$(this).off('drag', drag);
				rollback(e);
				currentDragObject = undefined;
			}
		}).attr('data-drag-role', 'container');
	};

	var onDrag = function (e) {
			$(this).trigger(
				$.Event('mm:start-dragging', {
					relatedTarget: this,
					gesture: e.gesture
				})
			);
			e.stopPropagation();
			e.preventDefault();
			if (e.gesture) {
				e.gesture.stopPropagation();
				e.gesture.preventDefault();
			}
		}, onShadowDrag = function (e) {
			$(this).trigger(
				$.Event('mm:start-dragging-shadow', {
					relatedTarget: this,
					gesture: e.gesture
				})
			);
			e.stopPropagation();
			e.preventDefault();
			if (e.gesture) {
				e.gesture.stopPropagation();
				e.gesture.preventDefault();
			}
		};
	$.fn.simpleDraggable = function (options) {
		if (!options || !options.disable) {
			return $(this).on('dragstart', onDrag);
		} else {
			return $(this).off('dragstart', onDrag);
		}
	};
	$.fn.shadowDraggable = function (options) {
		if (!options || !options.disable) {
			return $(this).on('dragstart', onShadowDrag);
		} else {
			return $(this).off('dragstart', onShadowDrag);
		}
	};
})();
/*jslint forin: true, nomen: true*/
/*global _, MAPJS, observable*/
MAPJS.MapModel = function (layoutCalculatorArg, selectAllTitles, clipboardProvider, defaultReorderMargin) {
	'use strict';
	var self = this,
		layoutCalculator = layoutCalculatorArg,
		reorderMargin = defaultReorderMargin || 20,
		clipboard = clipboardProvider || new MAPJS.MemoryClipboard(),
		analytic,
		currentLayout = {
			nodes: {},
			connectors: {}
		},
		idea,
		currentLabelGenerator,
		isInputEnabled = true,
		isEditingEnabled = true,
		currentlySelectedIdeaId,
		activatedNodes = [],
		setActiveNodes = function (activated) {
			var wasActivated = _.clone(activatedNodes);
			if (activated.length === 0) {
				activatedNodes = [currentlySelectedIdeaId];
			} else {
				activatedNodes = activated;
			}
			self.dispatchEvent('activatedNodesChanged', _.difference(activatedNodes, wasActivated), _.difference(wasActivated, activatedNodes));
		},
		horizontalSelectionThreshold = 300,
		isAddLinkMode,
		applyLabels = function (newLayout) {
			if (!currentLabelGenerator) {
				return;
			}
			var labelMap = currentLabelGenerator(idea);
			_.each(newLayout.nodes, function (node, id) {
				if (labelMap[id] || labelMap[id] === 0) {
					node.label = labelMap[id];
				}
			});
		},
		updateCurrentLayout = function (newLayout, sessionId) {
			self.dispatchEvent('layoutChangeStarting', _.size(newLayout.nodes) - _.size(currentLayout.nodes));
			applyLabels(newLayout);

			_.each(currentLayout.connectors, function (oldConnector, connectorId) {
				var newConnector = newLayout.connectors[connectorId];
				if (!newConnector || newConnector.from !== oldConnector.from || newConnector.to !== oldConnector.to) {
					self.dispatchEvent('connectorRemoved', oldConnector);
				}
			});
			_.each(currentLayout.links, function (oldLink, linkId) {
				var newLink = newLayout.links && newLayout.links[linkId];
				if (!newLink) {
					self.dispatchEvent('linkRemoved', oldLink);
				}
			});
			_.each(currentLayout.nodes, function (oldNode, nodeId) {
				var newNode = newLayout.nodes[nodeId],
					newActive;
				if (!newNode) {
					/*jslint eqeq: true*/
					if (nodeId == currentlySelectedIdeaId) {
						self.selectNode(idea.id);
					}
					newActive = _.reject(activatedNodes, function (e) {
						return e == nodeId;
					});
					if (newActive.length !== activatedNodes.length) {
						setActiveNodes(newActive);
					}
					self.dispatchEvent('nodeRemoved', oldNode, nodeId, sessionId);
				}
			});

			_.each(newLayout.nodes, function (newNode, nodeId) {
				var oldNode = currentLayout.nodes[nodeId];
				if (!oldNode) {
					self.dispatchEvent('nodeCreated', newNode, sessionId);
				} else {
					if (newNode.x !== oldNode.x || newNode.y !== oldNode.y) {
						self.dispatchEvent('nodeMoved', newNode, sessionId);
					}
					if (newNode.title !== oldNode.title) {
						self.dispatchEvent('nodeTitleChanged', newNode, sessionId);
					}
					if (!_.isEqual(newNode.attr || {}, oldNode.attr || {})) {
						self.dispatchEvent('nodeAttrChanged', newNode, sessionId);
					}
					if (newNode.label !== oldNode.label) {
						self.dispatchEvent('nodeLabelChanged', newNode, sessionId);
					}
				}
			});
			_.each(newLayout.connectors, function (newConnector, connectorId) {
				var oldConnector = currentLayout.connectors[connectorId];
				if (!oldConnector || newConnector.from !== oldConnector.from || newConnector.to !== oldConnector.to) {
					self.dispatchEvent('connectorCreated', newConnector, sessionId);
				}
			});
			_.each(newLayout.links, function (newLink, linkId) {
				var oldLink = currentLayout.links && currentLayout.links[linkId];
				if (oldLink) {
					if (!_.isEqual(newLink.attr || {}, (oldLink && oldLink.attr) || {})) {
						self.dispatchEvent('linkAttrChanged', newLink, sessionId);
					}
				} else {
					self.dispatchEvent('linkCreated', newLink, sessionId);
				}
			});
			currentLayout = newLayout;
			if (!self.isInCollapse) {
				self.dispatchEvent('layoutChangeComplete');
			}
		},
		revertSelectionForUndo,
		revertActivatedForUndo,
		selectNewIdea = function (newIdeaId) {
			revertSelectionForUndo = currentlySelectedIdeaId;
			revertActivatedForUndo = activatedNodes.slice(0);
			self.selectNode(newIdeaId);
		},
		editNewIdea = function (newIdeaId) {
			selectNewIdea(newIdeaId);
			self.editNode(false, true, true);
		},
		getCurrentlySelectedIdeaId = function () {
			return currentlySelectedIdeaId || idea.id;
		},
		paused = false,
		onIdeaChanged = function (action, args, sessionId) {
			if (paused) {
				return;
			}
			revertSelectionForUndo = false;
			revertActivatedForUndo = false;
			self.rebuildRequired(sessionId);
		},
		currentlySelectedIdea = function () {
			return (idea.findSubIdeaById(currentlySelectedIdeaId) || idea);
		},
		ensureNodeIsExpanded = function (source, nodeId) {
			var node = idea.findSubIdeaById(nodeId) || idea;
			if (node.getAttr('collapsed')) {
				idea.updateAttr(nodeId, 'collapsed', false);
			}
		};
	observable(this);
	analytic = self.dispatchEvent.bind(self, 'analytic', 'mapModel');
	self.pause = function () {
		paused = true;
	};
	self.resume = function () {
		paused = false;
		self.rebuildRequired();
	};
	self.getIdea = function () {
		return idea;
	};
	self.isEditingEnabled = function () {
		return isEditingEnabled;
	};
	self.getCurrentLayout = function () {
		return currentLayout;
	};
	self.analytic = analytic;
	self.getCurrentlySelectedIdeaId = getCurrentlySelectedIdeaId;
	self.rebuildRequired = function (sessionId) {
		if (!idea) {
			return;
		}
		updateCurrentLayout(self.reactivate(layoutCalculator(idea)), sessionId);
	};
	this.setIdea = function (anIdea) {
		if (idea) {
			idea.removeEventListener('changed', onIdeaChanged);
			paused = false;
			setActiveNodes([]);
			self.dispatchEvent('nodeSelectionChanged', currentlySelectedIdeaId, false);
			currentlySelectedIdeaId = undefined;
		}
		idea = anIdea;
		idea.addEventListener('changed', onIdeaChanged);
		onIdeaChanged();
		self.selectNode(idea.id, true);
		self.dispatchEvent('mapViewResetRequested');
	};
	this.setEditingEnabled = function (value) {
		isEditingEnabled = value;
	};
	this.getEditingEnabled = function () {
		return isEditingEnabled;
	};
	this.setInputEnabled = function (value, holdFocus) {
		if (isInputEnabled !== value) {
			isInputEnabled = value;
			self.dispatchEvent('inputEnabledChanged', value, !!holdFocus);
		}
	};
	this.getInputEnabled = function () {
		return isInputEnabled;
	};
	this.selectNode = function (id, force, appendToActive) {
		if (force || (isInputEnabled && (id !== currentlySelectedIdeaId || !self.isActivated(id)))) {
			if (currentlySelectedIdeaId) {
				self.dispatchEvent('nodeSelectionChanged', currentlySelectedIdeaId, false);
			}
			currentlySelectedIdeaId = id;
			if (appendToActive) {
				self.activateNode('internal', id);
			} else {
				setActiveNodes([id]);
			}

			self.dispatchEvent('nodeSelectionChanged', id, true);
		}
	};
	this.clickNode = function (id, event) {
		var button = event && event.button && event.button !== -1;
		if (event && event.altKey) {
			self.toggleLink('mouse', id);
		} else if (event && event.shiftKey) {
			/*don't stop propagation, this is needed for drop targets*/
			self.toggleActivationOnNode('mouse', id);
		} else if (isAddLinkMode && !button) {
			this.toggleLink('mouse', id);
			this.toggleAddLinkMode();
		} else {
			this.selectNode(id);
			if (button && button !== -1 && isInputEnabled) {
				self.dispatchEvent('contextMenuRequested', id, event.layerX, event.layerY);
			}
		}
	};
	this.findIdeaById = function (id) {
		/*jslint eqeq:true */
		if (idea.id == id) {
			return idea;
		}
		return idea.findSubIdeaById(id);
	};
	this.getSelectedStyle = function (prop) {
		return this.getStyleForId(currentlySelectedIdeaId, prop);
	};
	this.getStyleForId = function (id, prop) {
		var node = currentLayout.nodes && currentLayout.nodes[id];
		return node && node.attr && node.attr.style && node.attr.style[prop];
	};
	this.toggleCollapse = function (source) {
		var selectedIdea = currentlySelectedIdea(),
			isCollapsed;
		if (self.isActivated(selectedIdea.id) && _.size(selectedIdea.ideas) > 0) {
			isCollapsed = selectedIdea.getAttr('collapsed');
		} else {
			isCollapsed = self.everyActivatedIs(function (id) {
				var node = self.findIdeaById(id);
				if (node && _.size(node.ideas) > 0) {
					return node.getAttr('collapsed');
				}
				return true;
			});
		}
		this.collapse(source, !isCollapsed);
	};
	this.collapse = function (source, doCollapse) {
		analytic('collapse:' + doCollapse, source);
		self.isInCollapse = true;
		var contextNodeId = getCurrentlySelectedIdeaId(),
			contextNode = function () {
				return contextNodeId && currentLayout && currentLayout.nodes && currentLayout.nodes[contextNodeId];
			},
			moveNodes = function (nodes, deltaX, deltaY) {
				if (deltaX || deltaY) {
					_.each(nodes, function (node) {
						node.x += deltaX;
						node.y += deltaY;
						self.dispatchEvent('nodeMoved', node, 'scroll');
					});
				}
			},
			oldContext,
			newContext;
		oldContext = contextNode();
		if (isInputEnabled) {
			self.applyToActivated(function (id) {
				var node = self.findIdeaById(id);
				if (node && (!doCollapse || (node.ideas && _.size(node.ideas) > 0))) {
					idea.updateAttr(id, 'collapsed', doCollapse);
				}
			});
		}
		newContext = contextNode();
		if (oldContext && newContext) {
			moveNodes(
				currentLayout.nodes,
				oldContext.x - newContext.x,
				oldContext.y - newContext.y
			);
		}
		self.isInCollapse = false;
		self.dispatchEvent('layoutChangeComplete');
	};
	this.updateStyle = function (source, prop, value) {
		/*jslint eqeq:true */
		if (!isEditingEnabled) {
			return false;
		}
		if (isInputEnabled) {
			analytic('updateStyle:' + prop, source);
			self.applyToActivated(function (id) {
				if (self.getStyleForId(id, prop) != value) {
					idea.mergeAttrProperty(id, 'style', prop, value);
				}
			});
		}
	};
	this.updateLinkStyle = function (source, ideaIdFrom, ideaIdTo, prop, value) {
		if (!isEditingEnabled) {
			return false;
		}
		if (isInputEnabled) {
			analytic('updateLinkStyle:' + prop, source);
			var merged = _.extend({}, idea.getLinkAttr(ideaIdFrom, ideaIdTo, 'style'));
			merged[prop] = value;
			idea.updateLinkAttr(ideaIdFrom, ideaIdTo, 'style', merged);
		}
	};
	this.addSubIdea = function (source, parentId, initialTitle) {
		if (!isEditingEnabled) {
			return false;
		}
		var target = parentId || currentlySelectedIdeaId, newId;
		analytic('addSubIdea', source);
		if (isInputEnabled) {
			idea.batch(function () {
				ensureNodeIsExpanded(source, target);
				if (initialTitle) {
					newId = idea.addSubIdea(target, initialTitle);
				} else {
					newId = idea.addSubIdea(target);
				}
			});
			if (newId) {
				if (initialTitle) {
					selectNewIdea(newId);
				} else {
					editNewIdea(newId);
				}
			}
		}

	};
	this.insertIntermediate = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		if (!isInputEnabled || currentlySelectedIdeaId === idea.id) {
			return false;
		}
		var activeNodes = [], newId;
		analytic('insertIntermediate', source);
		self.applyToActivated(function (i) {
			activeNodes.push(i);
		});
		newId = idea.insertIntermediateMultiple(activeNodes);
		if (newId) {
			editNewIdea(newId);
		}
	};
	this.flip = function (source) {

		if (!isEditingEnabled) {
			return false;
		}
		analytic('flip', source);
		if (!isInputEnabled || currentlySelectedIdeaId === idea.id) {
			return false;
		}
		var node = currentLayout.nodes[currentlySelectedIdeaId];
		if (!node || node.level !== 2) {
			return false;
		}

		return idea.flip(currentlySelectedIdeaId);
	};
	this.addSiblingIdeaBefore = function (source) {
		var newId, parent, contextRank, newRank;
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addSiblingIdeaBefore', source);
		if (!isInputEnabled) {
			return false;
		}
		parent = idea.findParent(currentlySelectedIdeaId) || idea;
		idea.batch(function () {
			ensureNodeIsExpanded(source, parent.id);
			newId = idea.addSubIdea(parent.id);
			if (newId && currentlySelectedIdeaId !== idea.id) {
				contextRank = parent.findChildRankById(currentlySelectedIdeaId);
				newRank = parent.findChildRankById(newId);
				if (contextRank * newRank < 0) {
					idea.flip(newId);
				}
				idea.positionBefore(newId, currentlySelectedIdeaId);
			}
		});
		if (newId) {
			editNewIdea(newId);
		}
	};
	this.addSiblingIdea = function (source, optionalNodeId, optionalInitialText) {
		var newId, nextId, parent, contextRank, newRank, currentId;
		currentId = optionalNodeId || currentlySelectedIdeaId;
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addSiblingIdea', source);
		if (isInputEnabled) {
			parent = idea.findParent(currentId) || idea;
			idea.batch(function () {
				ensureNodeIsExpanded(source, parent.id);
				if (optionalInitialText) {
					newId = idea.addSubIdea(parent.id, optionalInitialText);
				} else {
					newId = idea.addSubIdea(parent.id);
				}
				if (newId && currentId !== idea.id) {
					nextId = idea.nextSiblingId(currentId);
					contextRank = parent.findChildRankById(currentId);
					newRank = parent.findChildRankById(newId);
					if (contextRank * newRank < 0) {
						idea.flip(newId);
					}
					if (nextId) {
						idea.positionBefore(newId, nextId);
					}
				}
			});
			if (newId) {
				if (optionalInitialText) {
					selectNewIdea(newId);
				} else {
					editNewIdea(newId);
				}
			}
		}
	};
	this.removeSubIdea = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('removeSubIdea', source);
		var removed;
		if (isInputEnabled) {
			self.applyToActivated(function (id) {
				/*jslint eqeq:true */
				var parent;
				if (currentlySelectedIdeaId == id) {
					parent = idea.findParent(currentlySelectedIdeaId);
					if (parent) {
						self.selectNode(parent.id);
					}
				}
				removed  = idea.removeSubIdea(id);
			});
		}
		return removed;
	};
	this.updateTitle = function (ideaId, title, isNew) {
		if (isNew) {
			idea.initialiseTitle(ideaId, title);
		} else {
			idea.updateTitle(ideaId, title);
		}
	};
	this.editNode = function (source, shouldSelectAll, editingNew) {
		if (!isEditingEnabled) {
			return false;
		}
		if (source) {
			analytic('editNode', source);
		}
		if (!isInputEnabled) {
			return false;
		}
		var title = currentlySelectedIdea().title;
		if (_.include(selectAllTitles, title)) { // === 'Press Space or double-click to edit') {
			shouldSelectAll = true;
		}
		self.dispatchEvent('nodeEditRequested', currentlySelectedIdeaId, shouldSelectAll, !!editingNew);
	};
	this.editIcon = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		if (source) {
			analytic('editIcon', source);
		}
		if (!isInputEnabled) {
			return false;
		}
		self.dispatchEvent('nodeIconEditRequested', currentlySelectedIdeaId);
	};
	this.scaleUp = function (source) {
		self.scale(source, 1.25);
	};
	this.scaleDown = function (source) {
		self.scale(source, 0.8);
	};
	this.scale = function (source, scaleMultiplier, zoomPoint) {
		if (isInputEnabled) {
			self.dispatchEvent('mapScaleChanged', scaleMultiplier, zoomPoint);
			analytic(scaleMultiplier < 1 ? 'scaleDown' : 'scaleUp', source);
		}
	};
	this.move = function (source, deltaX, deltaY) {
		if (isInputEnabled) {
			self.dispatchEvent('mapMoveRequested', deltaX, deltaY);
			analytic('move', source);
		}
	};
	this.resetView = function (source) {
		if (isInputEnabled) {
			self.selectNode(idea.id);
			self.dispatchEvent('mapViewResetRequested');
			analytic('resetView', source);
		}

	};
	this.openAttachment = function (source, nodeId) {
		analytic('openAttachment', source);
		nodeId = nodeId || currentlySelectedIdeaId;
		var node = currentLayout.nodes[nodeId],
			attachment = node && node.attr && node.attr.attachment;
		if (node) {
			self.dispatchEvent('attachmentOpened', nodeId, attachment);
		}
	};
	this.setAttachment = function (source, nodeId, attachment) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('setAttachment', source);
		var hasAttachment = !!(attachment && attachment.content);
		idea.updateAttr(nodeId, 'attachment', hasAttachment && attachment);
	};
	this.toggleLink = function (source, nodeIdTo) {
		var exists = _.find(idea.links, function (link) {
			return (String(link.ideaIdFrom) === String(nodeIdTo) && String(link.ideaIdTo) === String(currentlySelectedIdeaId)) || (String(link.ideaIdTo) === String(nodeIdTo) && String(link.ideaIdFrom) === String(currentlySelectedIdeaId));
		});
		if (exists) {
			self.removeLink(source, exists.ideaIdFrom, exists.ideaIdTo);
		} else {
			self.addLink(source, nodeIdTo);
		}
	};
	this.addLink = function (source, nodeIdTo) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addLink', source);
		idea.addLink(currentlySelectedIdeaId, nodeIdTo);
	};
	this.selectLink = function (source, link, selectionPoint) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('selectLink', source);
		if (!link) {
			return false;
		}
		self.dispatchEvent('linkSelected', link, selectionPoint, idea.getLinkAttr(link.ideaIdFrom, link.ideaIdTo, 'style'));
	};
	this.removeLink = function (source, nodeIdFrom, nodeIdTo) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('removeLink', source);
		idea.removeLink(nodeIdFrom, nodeIdTo);
	};

	this.toggleAddLinkMode = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		if (!isInputEnabled) {
			return false;
		}
		analytic('toggleAddLinkMode', source);
		isAddLinkMode = !isAddLinkMode;
		self.dispatchEvent('addLinkModeToggled', isAddLinkMode);
	};
	this.cancelCurrentAction = function (source) {
		if (!isInputEnabled) {
			return false;
		}
		if (!isEditingEnabled) {
			return false;
		}
		if (isAddLinkMode) {
			this.toggleAddLinkMode(source);
		}
	};
	self.undo = function (source) {
		if (!isEditingEnabled) {
			return false;
		}

		analytic('undo', source);
		var undoSelectionClone = revertSelectionForUndo,
			undoActivationClone = revertActivatedForUndo;
		if (isInputEnabled) {
			idea.undo();
			if (undoSelectionClone) {
				self.selectNode(undoSelectionClone);
			}
			if (undoActivationClone) {
				setActiveNodes(undoActivationClone);
			}

		}
	};
	self.redo = function (source) {
		if (!isEditingEnabled) {
			return false;
		}

		analytic('redo', source);
		if (isInputEnabled) {
			idea.redo();
		}
	};
	self.moveRelative = function (source, relativeMovement) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('moveRelative', source);
		if (isInputEnabled) {
			idea.moveRelative(currentlySelectedIdeaId, relativeMovement);
		}
	};
	self.cut = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('cut', source);
		if (isInputEnabled) {
			var activeNodeIds = [], parents = [], firstLiveParent;
			self.applyToActivated(function (nodeId) {
				activeNodeIds.push(nodeId);
				parents.push(idea.findParent(nodeId).id);
			});
			clipboard.put(idea.cloneMultiple(activeNodeIds));
			idea.removeMultiple(activeNodeIds);
			firstLiveParent = _.find(parents, idea.findSubIdeaById);
			self.selectNode(firstLiveParent || idea.id);
		}
	};
	self.contextForNode = function (nodeId) {
		var node = self.findIdeaById(nodeId),
				hasChildren = node && node.ideas && _.size(node.ideas) > 0,
				hasSiblings = idea.hasSiblings(nodeId),
				canPaste = node && isEditingEnabled && clipboard && clipboard.get();
		if (node) {
			return {'hasChildren': !!hasChildren, 'hasSiblings': !!hasSiblings, 'canPaste': !!canPaste};
		}

	};
	self.copy = function (source) {
		var activeNodeIds = [];
		if (!isEditingEnabled) {
			return false;
		}
		analytic('copy', source);
		if (isInputEnabled) {
			self.applyToActivated(function (node) {
				activeNodeIds.push(node);
			});
			clipboard.put(idea.cloneMultiple(activeNodeIds));
		}
	};
	self.paste = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('paste', source);
		if (isInputEnabled) {
			var result = idea.pasteMultiple(currentlySelectedIdeaId, clipboard.get());
			if (result && result[0]) {
				self.selectNode(result[0]);
			}
		}
	};
	self.pasteStyle = function (source) {
		var clipContents = clipboard.get(),
			pastingStyle;
		if (!isEditingEnabled) {
			return false;
		}
		analytic('pasteStyle', source);
		if (isInputEnabled && clipContents && clipContents[0]) {
			pastingStyle = clipContents[0].attr && clipContents[0].attr.style;
			self.applyToActivated(function (id) {
				idea.updateAttr(id, 'style', pastingStyle);
			});
		}
	};
	self.getIcon = function (nodeId) {
		var node = currentLayout.nodes[nodeId || currentlySelectedIdeaId];
		if (!node) {
			return false;
		}
		return node.attr && node.attr.icon;
	};
	self.setIcon = function (source, url, imgWidth, imgHeight, position, nodeId) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('setIcon', source);
		nodeId = nodeId || currentlySelectedIdeaId;
		var nodeIdea = self.findIdeaById(nodeId);
		if (!nodeIdea) {
			return false;
		}
		if (url) {
			idea.updateAttr(nodeId, 'icon', {
				url: url,
				width: imgWidth,
				height: imgHeight,
				position: position
			});
		} else if (nodeIdea.title || nodeId === idea.id) {
			idea.updateAttr(nodeId, 'icon', false);
		} else {
			idea.removeSubIdea(nodeId);
		}
	};
	self.moveUp = function (source) {
		self.moveRelative(source, -1);
	};
	self.moveDown = function (source) {
		self.moveRelative(source, 1);
	};
	self.getSelectedNodeId = function () {
		return getCurrentlySelectedIdeaId();
	};
	self.centerOnNode = function (nodeId) {
		if (!currentLayout.nodes[nodeId]) {
			idea.startBatch();
			_.each(idea.calculatePath(nodeId), function (parent) {
				idea.updateAttr(parent.id, 'collapsed', false);
			});
			idea.endBatch();
		}
		self.dispatchEvent('nodeFocusRequested', nodeId);
		self.selectNode(nodeId);
	};
	self.search = function (query) {
		var result = [];
		query = query.toLocaleLowerCase();
		idea.traverse(function (contentIdea) {
			if (contentIdea.title && contentIdea.title.toLocaleLowerCase().indexOf(query) >= 0) {
				result.push({id: contentIdea.id, title: contentIdea.title});
			}
		});
		return result;
	};
	//node activation and selection
	(function () {
			var isRootOrRightHalf = function (id) {
				return currentLayout.nodes[id].x >= currentLayout.nodes[idea.id].x;
			},
			isRootOrLeftHalf = function (id) {
				return currentLayout.nodes[id].x <= currentLayout.nodes[idea.id].x;
			},
			nodesWithIDs = function () {
				return _.map(currentLayout.nodes,
					function (n, nodeId) {
						return _.extend({ id: parseInt(nodeId, 10)}, n);
					});
			},
			applyToNodeLeft = function (source, analyticTag, method) {
				var node,
					rank,
					isRoot = currentlySelectedIdeaId === idea.id,
					targetRank = isRoot ? -Infinity : Infinity;
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (isRootOrLeftHalf(currentlySelectedIdeaId)) {
					node = idea.id === currentlySelectedIdeaId ? idea : idea.findSubIdeaById(currentlySelectedIdeaId);
					ensureNodeIsExpanded(source, node.id);
					for (rank in node.ideas) {
						rank = parseFloat(rank);
						if ((isRoot && rank < 0 && rank > targetRank) || (!isRoot && rank > 0 && rank < targetRank)) {
							targetRank = rank;
						}
					}
					if (targetRank !== Infinity && targetRank !== -Infinity) {
						method.apply(self, [node.ideas[targetRank].id]);
					}
				} else {
					method.apply(self, [idea.findParent(currentlySelectedIdeaId).id]);
				}
			},
			applyToNodeRight = function (source, analyticTag, method) {
				var node, rank, minimumPositiveRank = Infinity;
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (isRootOrRightHalf(currentlySelectedIdeaId)) {
					node = idea.id === currentlySelectedIdeaId ? idea : idea.findSubIdeaById(currentlySelectedIdeaId);
					ensureNodeIsExpanded(source, node.id);
					for (rank in node.ideas) {
						rank = parseFloat(rank);
						if (rank > 0 && rank < minimumPositiveRank) {
							minimumPositiveRank = rank;
						}
					}
					if (minimumPositiveRank !== Infinity) {
						method.apply(self, [node.ideas[minimumPositiveRank].id]);
					}
				} else {
					method.apply(self, [idea.findParent(currentlySelectedIdeaId).id]);
				}
			},
			applyToNodeUp = function (source, analyticTag, method) {
				var previousSibling = idea.previousSiblingId(currentlySelectedIdeaId),
					nodesAbove,
					closestNode,
					currentNode = currentLayout.nodes[currentlySelectedIdeaId];
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (previousSibling) {
					method.apply(self, [previousSibling]);
				} else {
					if (!currentNode) {
						return;
					}
					nodesAbove = _.reject(nodesWithIDs(), function (node) {
						return node.y >= currentNode.y || Math.abs(node.x - currentNode.x) > horizontalSelectionThreshold;
					});
					if (_.size(nodesAbove) === 0) {
						return;
					}
					closestNode = _.min(nodesAbove, function (node) {
						return Math.pow(node.x - currentNode.x, 2) + Math.pow(node.y - currentNode.y, 2);
					});
					method.apply(self, [closestNode.id]);
				}
			},
			applyToNodeDown = function (source, analyticTag, method) {
				var nextSibling = idea.nextSiblingId(currentlySelectedIdeaId),
					nodesBelow,
					closestNode,
					currentNode = currentLayout.nodes[currentlySelectedIdeaId];
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (nextSibling) {
					method.apply(self, [nextSibling]);
				} else {
					if (!currentNode) {
						return;
					}
					nodesBelow = _.reject(nodesWithIDs(), function (node) {
						return node.y <= currentNode.y || Math.abs(node.x - currentNode.x) > horizontalSelectionThreshold;
					});
					if (_.size(nodesBelow) === 0) {
						return;
					}
					closestNode = _.min(nodesBelow, function (node) {
						return Math.pow(node.x - currentNode.x, 2) + Math.pow(node.y - currentNode.y, 2);
					});
					method.apply(self, [closestNode.id]);
				}
			},
			applyFuncs = { 'Left': applyToNodeLeft, 'Up': applyToNodeUp, 'Down': applyToNodeDown, 'Right': applyToNodeRight };
			self.getActivatedNodeIds = function () {
				return activatedNodes.slice(0);
			};
			self.activateSiblingNodes = function (source) {
				var parent = idea.findParent(currentlySelectedIdeaId),
					siblingIds;
				analytic('activateSiblingNodes', source);
				if (!parent || !parent.ideas) {
					return;
				}
				siblingIds = _.map(parent.ideas, function (child) {
					return child.id;
				});
				setActiveNodes(siblingIds);
			};
			self.activateNodeAndChildren = function (source) {
				analytic('activateNodeAndChildren', source);
				var contextId = getCurrentlySelectedIdeaId(),
					subtree = idea.getSubTreeIds(contextId);
				subtree.push(contextId);
				setActiveNodes(subtree);
			};
			_.each(['Left', 'Right', 'Up', 'Down'], function (position) {
				self['activateNode' + position] = function (source) {
					applyFuncs[position](source, 'activateNode' + position, function (nodeId) {
						self.selectNode(nodeId, false, true);
					});
				};
				self['selectNode' + position] = function (source) {
					applyFuncs[position](source, 'selectNode' + position, self.selectNode);
				};
			});
			self.toggleActivationOnNode = function (source, nodeId) {
				analytic('toggleActivated', source);
				if (!self.isActivated(nodeId)) {
					setActiveNodes([nodeId].concat(activatedNodes));
				} else {
					setActiveNodes(_.without(activatedNodes, nodeId));
				}
			};
			self.activateNode = function (source, nodeId) {
				analytic('activateNode', source);
				if (!self.isActivated(nodeId)) {
					activatedNodes.push(nodeId);
					self.dispatchEvent('activatedNodesChanged', [nodeId], []);
				}
			};
			self.activateChildren = function (source) {
				analytic('activateChildren', source);
				var context = currentlySelectedIdea();
				if (!context || _.isEmpty(context.ideas) || context.getAttr('collapsed')) {
					return;
				}
				setActiveNodes(idea.getSubTreeIds(context.id));
			};
			self.activateSelectedNode = function (source) {
				analytic('activateSelectedNode', source);
				setActiveNodes([getCurrentlySelectedIdeaId()]);
			};
			self.isActivated = function (id) {
				/*jslint eqeq:true*/
				return _.find(activatedNodes, function (activeId) {
					return id == activeId;
				});
			};
			self.applyToActivated = function (toApply) {
				idea.batch(function () {
					_.each(activatedNodes, toApply);
				});
			};
			self.everyActivatedIs = function (predicate) {
				return _.every(activatedNodes, predicate);
			};
			self.activateLevel = function (source, level) {
				analytic('activateLevel', source);
				var toActivate = _.map(
					_.filter(
						currentLayout.nodes,
						function (node) {
							/*jslint eqeq:true*/
							return node.level == level;
						}
					),
					function (node) {
						return node.id;
					}
				);
				if (!_.isEmpty(toActivate)) {
					setActiveNodes(toActivate);
				}
			};
			self.reactivate = function (layout) {
				_.each(layout.nodes, function (node) {
					if (_.contains(activatedNodes, node.id)) {
						node.activated = true;
					}
				});
				return layout;
			};
		}());

	self.getNodeIdAtPosition = function (x, y) {
		var isPointOverNode = function (node) { //move to mapModel candidate
				/*jslint eqeq: true*/
				return x >= node.x &&
					y >= node.y &&
					x <= node.x + node.width &&
					y <= node.y + node.height;
			},
			node = _.find(currentLayout.nodes, isPointOverNode);
		return node && node.id;
	};
	self.autoPosition = function (nodeId) {
		return idea.updateAttr(nodeId, 'position', false);
	};
	self.positionNodeAt = function (nodeId, x, y, manualPosition) {
		var rootNode = currentLayout.nodes[idea.id],
			verticallyClosestNode = {
				id: null,
				y: Infinity
			},
			parentIdea = idea.findParent(nodeId),
			parentNode = currentLayout.nodes[parentIdea.id],
			nodeBeingDragged = currentLayout.nodes[nodeId],
			tryFlip = function (rootNode, nodeBeingDragged, nodeDragEndX) {
				var flipRightToLeft = rootNode.x < nodeBeingDragged.x && nodeDragEndX < rootNode.x,
					flipLeftToRight = rootNode.x > nodeBeingDragged.x && rootNode.x < nodeDragEndX;
				if (flipRightToLeft || flipLeftToRight) {
					return idea.flip(nodeId);
				}
				return false;
			},
			maxSequence = 1,
			validReposition = function () {
				return nodeBeingDragged.level === 2 ||
					((nodeBeingDragged.x - parentNode.x) * (x - parentNode.x) > 0);
			},
			result = false,
			xOffset;
		idea.startBatch();
		if (currentLayout.nodes[nodeId].level === 2) {
			result = tryFlip(rootNode, nodeBeingDragged, x);
		}
		_.each(idea.sameSideSiblingIds(nodeId), function (id) {
			var node = currentLayout.nodes[id];
			if (y < node.y && node.y < verticallyClosestNode.y) {
				verticallyClosestNode = node;
			}
		});
		if (!manualPosition && validReposition()) {
			self.autoPosition(nodeId);
		}
		result = idea.positionBefore(nodeId, verticallyClosestNode.id) || result;
		if (manualPosition && validReposition()) {
			if (x < parentNode.x) {
				xOffset = parentNode.x - x - nodeBeingDragged.width + parentNode.width; /* negative nodes will get flipped so distance is not correct out of the box */
			} else {
				xOffset = x - parentNode.x;
			}
			analytic('nodeManuallyPositioned');
			maxSequence = _.max(_.map(parentIdea.ideas, function (i) {
				return (i.id !== nodeId && i.attr && i.attr.position && i.attr.position[2]) || 0;
			}));
			result = idea.updateAttr(
				nodeId,
				'position',
				[xOffset, y - parentNode.y, maxSequence + 1]
			) || result;
		}
		idea.endBatch();
		return result;
	};
	self.dropNode = function (nodeId, dropTargetId, shiftKey) {
		var clone,
			parentIdea = idea.findParent(nodeId);
		if (dropTargetId === nodeId) {
			return false;
		}
		if (shiftKey) {
			clone = idea.clone(nodeId);
			if (clone) {
				idea.paste(dropTargetId, clone);
			}
			return false;
		}
		if (dropTargetId === parentIdea.id) {
			return self.autoPosition(nodeId);
		} else {
			return idea.changeParent(nodeId, dropTargetId);
		}
	};
	self.setLayoutCalculator = function (newCalculator) {
		layoutCalculator = newCalculator;
	};
	self.dropImage =  function (dataUrl, imgWidth, imgHeight, x, y) {
		var nodeId,
			dropOn = function (ideaId, position) {
				var scaleX = Math.min(imgWidth, 300) / imgWidth,
					scaleY = Math.min(imgHeight, 300) / imgHeight,
					scale = Math.min(scaleX, scaleY),
					existing = idea.getAttrById(ideaId, 'icon');
				self.setIcon('drag and drop', dataUrl, Math.round(imgWidth * scale), Math.round(imgHeight * scale), (existing && existing.position) || position, ideaId);
			},
			addNew = function () {
				var newId;
				idea.startBatch();
				newId = idea.addSubIdea(currentlySelectedIdeaId);
				dropOn(newId, 'center');
				idea.endBatch();
				self.selectNode(newId);
			};
		nodeId = self.getNodeIdAtPosition(x, y);
		if (nodeId) {
			return dropOn(nodeId, 'left');
		}
		addNew();
	};
	self.setLabelGenerator = function (labelGenerator) {
		currentLabelGenerator = labelGenerator;
		self.rebuildRequired();
	};
	self.getReorderBoundary = function (nodeId) {
		var isRoot = function () {
				/*jslint eqeq: true*/
				return nodeId == idea.id;
			},
			isFirstLevel = function () {
				return parentIdea.id === idea.id;
			},
			isRightHalf = function (nodeId) {
				return currentLayout.nodes[nodeId].x >= currentLayout.nodes[idea.id].x;
			},
			siblingBoundary = function (siblings, side) {
				var tops = _.map(siblings, function (node) {
					return node.y;
				}),
				bottoms = _.map(siblings, function (node) {
					return node.y + node.height;
				}),
				result = {
					'minY': _.min(tops) -  reorderMargin - currentLayout.nodes[nodeId].height,
					'maxY': _.max(bottoms) +  reorderMargin,
					'margin': reorderMargin
				};
				result.edge = side;
				if (side === 'left') {
					result.x = parentNode.x + parentNode.width + reorderMargin;
				} else {
					result.x = parentNode.x - reorderMargin;
				}
				return result;
			},
			parentBoundary = function (side) {
				var result = {
					'minY': parentNode.y -  reorderMargin - currentLayout.nodes[nodeId].height,
					'maxY': parentNode.y + parentNode.height +  reorderMargin,
					'margin': reorderMargin
				};
				result.edge = side;
				if (side === 'left') {
					result.x = parentNode.x + parentNode.width + reorderMargin;
				} else {
					result.x = parentNode.x - reorderMargin;
				}

				return result;
			},
			otherSideSiblings = function () {
				var otherSide = _.map(parentIdea.ideas, function (subIdea) {
					return currentLayout.nodes[subIdea.id];
				});
				otherSide = _.without(otherSide, currentLayout.nodes[nodeId]);
				if (!_.isEmpty(sameSide)) {
					otherSide = _.difference(otherSide, sameSide);
				}
				return otherSide;
			},
			parentIdea,
			parentNode,
			boundaries = [],
			sameSide,
			opposite,
			primaryEdge,
			secondaryEdge;
		if (isRoot(nodeId)) {
			return false;
		}
		parentIdea = idea.findParent(nodeId);
		parentNode = currentLayout.nodes[parentIdea.id];
		primaryEdge = isRightHalf(nodeId) ? 'left' : 'right';
		secondaryEdge = isRightHalf(nodeId) ? 'right' : 'left';
		sameSide = _.map(idea.sameSideSiblingIds(nodeId), function (id) {
			return currentLayout.nodes[id];
		});
		if (!_.isEmpty(sameSide)) {
			boundaries.push(siblingBoundary(sameSide, primaryEdge));
		}
		boundaries.push(parentBoundary(primaryEdge));
		if (isFirstLevel()) {
			opposite = otherSideSiblings();
			if (!_.isEmpty(opposite)) {
				boundaries.push(siblingBoundary(opposite, secondaryEdge));
			}
			boundaries.push(parentBoundary(secondaryEdge));
		}
		return boundaries;
	};
	self.focusAndSelect = function (nodeId) {
		self.selectNode(nodeId);
		self.dispatchEvent('nodeFocusRequested', nodeId);
	};
	self.requestContextMenu = function (eventPointX, eventPointY) {
		if (isInputEnabled && isEditingEnabled) {
			self.dispatchEvent('contextMenuRequested', currentlySelectedIdeaId, eventPointX, eventPointY);
			return true;
		}
		return false;
	};
};
/*global jQuery*/
jQuery.fn.mapToolbarWidget = function (mapModel) {
	'use strict';
	var clickMethodNames = ['insertIntermediate', 'scaleUp', 'scaleDown', 'addSubIdea', 'editNode', 'removeSubIdea', 'toggleCollapse', 'addSiblingIdea', 'undo', 'redo',
			'copy', 'cut', 'paste', 'resetView', 'openAttachment', 'toggleAddLinkMode', 'activateChildren', 'activateNodeAndChildren', 'activateSiblingNodes', 'editIcon'],
		changeMethodNames = ['updateStyle'];
	return this.each(function () {
		var element = jQuery(this), preventRoundtrip = false;
		mapModel.addEventListener('nodeSelectionChanged', function () {
			preventRoundtrip = true;
			element.find('.updateStyle[data-mm-target-property]').val(function () {
				return mapModel.getSelectedStyle(jQuery(this).data('mm-target-property'));
			}).change();
			preventRoundtrip = false;
		});
		mapModel.addEventListener('addLinkModeToggled', function () {
			element.find('.toggleAddLinkMode').toggleClass('active');
		});
		clickMethodNames.forEach(function (methodName) {
			element.find('.' + methodName).click(function () {
				if (mapModel[methodName]) {
					mapModel[methodName]('toolbar');
				}
			});
		});
		changeMethodNames.forEach(function (methodName) {
			element.find('.' + methodName).change(function () {
				if (preventRoundtrip) {
					return;
				}
				var tool = jQuery(this);
				if (tool.data('mm-target-property')) {
					mapModel[methodName]('toolbar', tool.data('mm-target-property'), tool.val());
				}
			});
		});
	});
};
/*global jQuery*/
jQuery.fn.linkEditWidget = function (mapModel) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this), currentLink, width, height, colorElement, lineStyleElement, arrowElement;
		colorElement = element.find('.color');
		lineStyleElement = element.find('.lineStyle');
		arrowElement = element.find('.arrow');
		mapModel.addEventListener('linkSelected', function (link, selectionPoint, linkStyle) {
			currentLink = link;
			element.show();
			width = width || element.width();
			height = height || element.height();
			element.css({
				top: (selectionPoint.y - 0.5 * height - 15) + 'px',
				left: (selectionPoint.x - 0.5 * width - 15) + 'px'
			});
			colorElement.val(linkStyle.color).change();
			lineStyleElement.val(linkStyle.lineStyle);
			arrowElement[linkStyle.arrow ? 'addClass' : 'removeClass']('active');
		});
		mapModel.addEventListener('mapMoveRequested', function () {
			element.hide();
		});
		element.find('.delete').click(function () {
			mapModel.removeLink('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo);
			element.hide();
		});
		colorElement.change(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'color', jQuery(this).val());
		});
		lineStyleElement.find('a').click(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'lineStyle', jQuery(this).text());
		});
		arrowElement.click(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'arrow', !arrowElement.hasClass('active'));
		});
		element.mouseleave(element.hide.bind(element));
	});
};
/*global observable, jQuery, FileReader, Image, MAPJS, document, _ */
MAPJS.getDataURIAndDimensions = function (src, corsProxyUrl) {
	'use strict';
	var isDataUri = function (string) {
			return (/^data:image/).test(string);
		},
		convertSrcToDataUri = function (img) {
			if (isDataUri(img.src)) {
				return img.src;
			}
			var canvas = document.createElement('canvas'),
				ctx;
			canvas.width = img.width;
			canvas.height = img.height;
			ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			return canvas.toDataURL('image/png');
		},
		deferred = jQuery.Deferred(),
		domImg = new Image();

	domImg.onload = function () {
		try {
			deferred.resolve({dataUri: convertSrcToDataUri(domImg), width: domImg.width, height: domImg.height});
		} catch (e) {
			deferred.reject();
		}
	};
	domImg.onerror = function () {
		deferred.reject();
	};
	if (!isDataUri(src)) {
		if (corsProxyUrl) {
			domImg.crossOrigin = 'Anonymous';
			src = corsProxyUrl + encodeURIComponent(src);
		} else {
			deferred.reject('no-cors');
		}
	}
	domImg.src = src;
	return deferred.promise();
};
MAPJS.ImageInsertController = function (corsProxyUrl, resourceConverter) {
	'use strict';
	var self = observable(this),
		readFileIntoDataUrl = function (fileInfo) {
			var loader = jQuery.Deferred(),
				fReader = new FileReader();
			fReader.onload = function (e) {
				loader.resolve(e.target.result);
			};
			fReader.onerror = loader.reject;
			fReader.onprogress = loader.notify;
			fReader.readAsDataURL(fileInfo);
			return loader.promise();
		};
	self.insertDataUrl = function (dataUrl, evt) {
		self.dispatchEvent('imageLoadStarted');
		MAPJS.getDataURIAndDimensions(dataUrl, corsProxyUrl).then(
			function (result) {
				var storeUrl = result.dataUri;
				if (resourceConverter) {
					storeUrl = resourceConverter(storeUrl);
				}
				self.dispatchEvent('imageInserted', storeUrl, result.width, result.height, evt);
			},
			function (reason) {
				self.dispatchEvent('imageInsertError', reason);
			}
		);
	};
	self.insertFiles = function (files, evt) {
		jQuery.each(files, function (idx, fileInfo) {
			if (/^image\//.test(fileInfo.type)) {
				jQuery.when(readFileIntoDataUrl(fileInfo)).done(function (dataUrl) {
					self.insertDataUrl(dataUrl, evt);
				});
			}
		});
	};
	self.insertHtmlContent = function (htmlContent, evt) {
		var images = htmlContent.match(/img[^>]*src="([^"]*)"/);
		if (images && images.length > 0) {
			_.each(images.slice(1), function (dataUrl) {
				self.insertDataUrl(dataUrl, evt);
			});
		}
	};
};
jQuery.fn.imageDropWidget = function (imageInsertController) {
	'use strict';
	this.on('dragenter dragover', function (e) {
		if (e.originalEvent.dataTransfer) {
			return false;
		}
	}).on('drop', function (e) {
		var dataTransfer = e.originalEvent.dataTransfer,
			htmlContent;
		e.stopPropagation();
		e.preventDefault();
		if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
			imageInsertController.insertFiles(dataTransfer.files, e.originalEvent);
		} else if (dataTransfer) {
			htmlContent = dataTransfer.getData('text/html');
			imageInsertController.insertHtmlContent(htmlContent, e.originalEvent);
		}
	});
	return this;
};
/*global jQuery, Color, _, MAPJS, document, window*/
MAPJS.DOMRender = {
	svgPixel: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
	nodeCacheMark: function (idea, levelOverride) {
		'use strict';
		return {
			title: idea.title,
			icon: idea.attr && idea.attr.icon && _.pick(idea.attr.icon, 'width', 'height', 'position'),
			collapsed: idea.attr && idea.attr.collapsed,
			level: idea.level || levelOverride
		};
	},
	dummyTextBox: jQuery('<div>').addClass('mapjs-node').css({position: 'absolute', visibility: 'hidden'}),
	dimensionProvider: function (idea, level) {
		'use strict'; /* support multiple stages? */
		var textBox = jQuery(document).nodeWithId(idea.id),
			translateToPixel = function () {
				return MAPJS.DOMRender.svgPixel;
			},
			result;
		if (textBox && textBox.length > 0) {
			if (_.isEqual(textBox.data('nodeCacheMark'), MAPJS.DOMRender.nodeCacheMark(idea, level))) {
				return _.pick(textBox.data(), 'width', 'height');
			}
		}
		textBox = MAPJS.DOMRender.dummyTextBox;
		textBox.attr('mapjs-level', level).appendTo('body').updateNodeContent(idea, translateToPixel);
		result = {
			width: textBox.outerWidth(true),
			height: textBox.outerHeight(true)
		};
		textBox.detach();
		return result;
	},
	layoutCalculator: function (contentAggregate) {
		'use strict';
		return MAPJS.calculateLayout(contentAggregate, MAPJS.DOMRender.dimensionProvider);
	},
	fixedLayout: false
};
MAPJS.createSVG = function (tag) {
	'use strict';
	return jQuery(document.createElementNS('http://www.w3.org/2000/svg', tag || 'svg'));
};
jQuery.fn.getBox = function () {
	'use strict';
	var domShape = this && this[0];
	if (!domShape) {
		return false;
	}
	return {
		top: domShape.offsetTop,
		left: domShape.offsetLeft,
		width: domShape.offsetWidth,
		height: domShape.offsetHeight
	};
};
jQuery.fn.getDataBox = function () {
	'use strict';
	var domShapeData = this.data();
	if (domShapeData && domShapeData.width && domShapeData.height) {
		return {
			top: domShapeData.y,
			left: domShapeData.x,
			width: domShapeData.width,
			height: domShapeData.height
		};
	}
	return this.getBox();
};


jQuery.fn.animateConnectorToPosition = function (animationOptions, tolerance) {
	'use strict';
	var element = jQuery(this),
		shapeFrom = element.data('nodeFrom'),
		shapeTo = element.data('nodeTo'),
		fromBox = shapeFrom && shapeFrom.getDataBox(),
		toBox = shapeTo && shapeTo.getDataBox(),
		oldBox = {
			from: shapeFrom && shapeFrom.getBox(),
			to: shapeTo && shapeTo.getBox()
		};
	tolerance = tolerance || 1;
	if (fromBox && toBox && oldBox && oldBox.from.width === fromBox.width &&
		oldBox.to.width   === toBox.width   &&
		oldBox.from.height  === fromBox.height    &&
		oldBox.to.height  === toBox.height    &&
		Math.abs(oldBox.from.top - oldBox.to.top - (fromBox.top - toBox.top)) < tolerance &&
		Math.abs(oldBox.from.left - oldBox.to.left - (fromBox.left - toBox.left)) < tolerance) {

		element.animate({
			left: Math.round(Math.min(fromBox.left, toBox.left)),
			top: Math.round(Math.min(fromBox.top, toBox.top))
		}, animationOptions);
		return true;
	}
	return false;
};
jQuery.fn.queueFadeOut = function (options) {
	'use strict';
	var element = this;
	return element.fadeOut(_.extend({
		complete: function () {
			if (element.is(':focus')) {
				element.parents('[tabindex]').focus();
			}
			element.remove();
		}
	}, options));
};
jQuery.fn.queueFadeIn = function (options) {
	'use strict';
	var element = this;
	return element
		.css('opacity', 0)
		.animate(
			{'opacity': 1},
			_.extend({ complete: function () {
				element.css('opacity', '');
			}}, options)
		);
};

jQuery.fn.updateStage = function () {
	'use strict';
	var data = this.data(),
		size = {
			'min-width': Math.round(data.width - data.offsetX),
			'min-height': Math.round(data.height - data.offsetY),
			'width': Math.round(data.width - data.offsetX),
			'height': Math.round(data.height - data.offsetY),
			'transform-origin': 'top left',
			'transform': 'translate3d(' + Math.round(data.offsetX) + 'px, ' + Math.round(data.offsetY) + 'px, 0)'
		};
	if (data.scale && data.scale !== 1) {
		size.transform = 'scale(' + data.scale + ') translate(' + Math.round(data.offsetX) + 'px, ' + Math.round(data.offsetY) + 'px)';
	}
	this.css(size);
	return this;
};

MAPJS.DOMRender.curvedPath = function (parent, child) {
	'use strict';
	var horizontalConnector = function (parentX, parentY, parentWidth, parentHeight, childX, childY, childWidth, childHeight) {
			var childHorizontalOffset = parentX < childX ? 0.1 : 0.9,
				parentHorizontalOffset = 1 - childHorizontalOffset;
			return {
				from: {
					x: parentX + parentHorizontalOffset * parentWidth,
					y: parentY + 0.5 * parentHeight
				},
				to: {
					x: childX + childHorizontalOffset * childWidth,
					y: childY + 0.5 * childHeight
				},
				controlPointOffset: 0
			};
		},
		calculateConnector = function (parent, child) {
			var tolerance = 10,
				childHorizontalOffset,
				childMid = child.top + child.height * 0.5,
				parentMid = parent.top + parent.height * 0.5;
			if (Math.abs(parentMid - childMid) + tolerance < Math.max(child.height, parent.height * 0.75)) {
				return horizontalConnector(parent.left, parent.top, parent.width, parent.height, child.left, child.top, child.width, child.height);
			}
			childHorizontalOffset = parent.left < child.left ? 0 : 1;
			return {
				from: {
					x: parent.left + 0.5 * parent.width,
					y: parent.top + 0.5 * parent.height
				},
				to: {
					x: child.left + childHorizontalOffset * child.width,
					y: child.top + 0.5 * child.height
				},
				controlPointOffset: 0.75
			};
		},
		position = {
			left: Math.min(parent.left, child.left),
			top: Math.min(parent.top, child.top)
		},
		calculatedConnector, offset, maxOffset;
	position.width = Math.max(parent.left + parent.width, child.left + child.width, position.left + 1) - position.left;
	position.height = Math.max(parent.top + parent.height, child.top + child.height, position.top + 1) - position.top;

	calculatedConnector = calculateConnector(parent, child);
	offset = calculatedConnector.controlPointOffset * (calculatedConnector.from.y - calculatedConnector.to.y);
	maxOffset = Math.min(child.height, parent.height) * 1.5;
	offset = Math.max(-maxOffset, Math.min(maxOffset, offset));
	return {
		'd': 'M' + Math.round(calculatedConnector.from.x - position.left) + ',' + Math.round(calculatedConnector.from.y - position.top) +
			'Q' + Math.round(calculatedConnector.from.x - position.left) + ',' + Math.round(calculatedConnector.to.y - offset - position.top) + ' ' + Math.round(calculatedConnector.to.x - position.left) + ',' + Math.round(calculatedConnector.to.y - position.top),
		// 'conn': calculatedConnector,
		'position': position
	};
};
MAPJS.DOMRender.straightPath = function (parent, child) {
	'use strict';
	var calculateConnector = function (parent, child) {
		var parentPoints = [
			{
				x: parent.left + 0.5 * parent.width,
				y: parent.top
			},
			{
				x: parent.left + parent.width,
				y: parent.top + 0.5 * parent.height
			},
			{
				x: parent.left + 0.5 * parent.width,
				y: parent.top + parent.height
			},
			{
				x: parent.left,
				y: parent.top + 0.5 * parent.height
			}
		], childPoints = [
			{
				x: child.left + 0.5 * child.width,
				y: child.top
			},
			{
				x: child.left + child.width,
				y: child.top + 0.5 * child.height
			},
			{
				x: child.left + 0.5 * child.width,
				y: child.top + child.height
			},
			{
				x: child.left,
				y: child.top + 0.5 * child.height
			}
		], i, j, min = Infinity, bestParent, bestChild, dx, dy, current;
		for (i = 0; i < parentPoints.length; i += 1) {
			for (j = 0; j < childPoints.length; j += 1) {
				dx = parentPoints[i].x - childPoints[j].x;
				dy = parentPoints[i].y - childPoints[j].y;
				current = dx * dx + dy * dy;
				if (current < min) {
					bestParent = i;
					bestChild = j;
					min = current;
				}
			}
		}
		return {
			from: parentPoints[bestParent],
			to: childPoints[bestChild]
		};
	},
	position = {
		left: Math.min(parent.left, child.left),
		top: Math.min(parent.top, child.top)
	},
	conn = calculateConnector(parent, child);
	position.width = Math.max(parent.left + parent.width, child.left + child.width, position.left + 1) - position.left;
	position.height = Math.max(parent.top + parent.height, child.top + child.height, position.top + 1) - position.top;

	return {
		'd': 'M' + Math.round(conn.from.x - position.left) + ',' + Math.round(conn.from.y - position.top) + 'L' + Math.round(conn.to.x - position.left) + ',' + Math.round(conn.to.y - position.top),
		'conn': conn,
		'position': position
	};
};

MAPJS.DOMRender.nodeConnectorPath = MAPJS.DOMRender.curvedPath;
MAPJS.DOMRender.linkConnectorPath = MAPJS.DOMRender.straightPath;

jQuery.fn.updateConnector = function (canUseData) {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			shapeFrom = element.data('nodeFrom'),
			shapeTo = element.data('nodeTo'),
			connection, pathElement, fromBox, toBox, changeCheck;
		if (!shapeFrom || !shapeTo || shapeFrom.length === 0 || shapeTo.length === 0) {
			element.hide();
			return;
		}
		if (canUseData) {
			fromBox = shapeFrom.getDataBox();
			toBox = shapeTo.getDataBox();
		} else {
			fromBox = shapeFrom.getBox();
			toBox = shapeTo.getBox();
		}
		changeCheck = {from: fromBox, to: toBox};
		if (_.isEqual(changeCheck, element.data('changeCheck'))) {
			return;
		}

		element.data('changeCheck', changeCheck);
		connection = MAPJS.DOMRender.nodeConnectorPath(fromBox, toBox);
		pathElement = element.find('path');
		element.css(connection.position);
		if (pathElement.length === 0) {
			pathElement = MAPJS.createSVG('path').attr('class', 'mapjs-connector').appendTo(element);
		}
		// if only the relative position changed, do not re-update the curve!!!!
		pathElement.attr('d',
			connection.d
		);
	});
};

jQuery.fn.updateLink = function () {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			shapeFrom = element.data('nodeFrom'),
			shapeTo = element.data('nodeTo'),
			connection,
			pathElement = element.find('path.mapjs-link'),
			hitElement = element.find('path.mapjs-link-hit'),
			arrowElement = element.find('path.mapjs-arrow'),
			n = Math.tan(Math.PI / 9),
			dashes = {
				dashed: '8, 8',
				solid: ''
			},
			attrs = _.pick(element.data(), 'lineStyle', 'arrow', 'color'),
			fromBox, toBox, changeCheck,
			a1x, a1y, a2x, a2y, len, iy, m, dx, dy;
		if (!shapeFrom || !shapeTo || shapeFrom.length === 0 || shapeTo.length === 0) {
			element.hide();
			return;
		}
		fromBox = shapeFrom.getBox();
		toBox = shapeTo.getBox();

		changeCheck = {from: fromBox, to: toBox, attrs: attrs};
		if (_.isEqual(changeCheck, element.data('changeCheck'))) {
			return;
		}

		element.data('changeCheck', changeCheck);

		connection = MAPJS.DOMRender.linkConnectorPath(fromBox, toBox);
		element.css(connection.position);

		if (pathElement.length === 0) {
			pathElement = MAPJS.createSVG('path').attr('class', 'mapjs-link').appendTo(element);
		}
		pathElement.attr({
			'd': connection.d,
			'stroke-dasharray': dashes[attrs.lineStyle]
		}).css('stroke', attrs.color);

		if (hitElement.length === 0) {
			hitElement = MAPJS.createSVG('path').attr('class', 'mapjs-link-hit').appendTo(element);
		}
		hitElement.attr({
			'd': connection.d
		});

		if (attrs.arrow) {
			if (arrowElement.length === 0) {
				arrowElement = MAPJS.createSVG('path').attr('class', 'mapjs-arrow').appendTo(element);
			}
			len = 14;
			dx = connection.conn.to.x - connection.conn.from.x;
			dy = connection.conn.to.y - connection.conn.from.y;
			if (dx === 0) {
				iy = dy < 0 ? -1 : 1;
				a1x = connection.conn.to.x + len * Math.sin(n) * iy;
				a2x = connection.conn.to.x - len * Math.sin(n) * iy;
				a1y = connection.conn.to.y - len * Math.cos(n) * iy;
				a2y = connection.conn.to.y - len * Math.cos(n) * iy;
			} else {
				m = dy / dx;
				if (connection.conn.from.x < connection.conn.to.x) {
					len = -len;
				}
				a1x = connection.conn.to.x + (1 - m * n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
				a1y = connection.conn.to.y + (m + n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
				a2x = connection.conn.to.x + (1 + m * n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
				a2y = connection.conn.to.y + (m - n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
			}
			arrowElement.attr('d',
				'M' + Math.round(a1x - connection.position.left) + ',' + Math.round(a1y - connection.position.top) +
				'L' + Math.round(connection.conn.to.x - connection.position.left) + ',' + Math.round(connection.conn.to.y - connection.position.top) +
				'L' + Math.round(a2x - connection.position.left) + ',' + Math.round(a2y - connection.position.top) +
				'Z')
				.css('fill', attrs.color)
				.show();
		} else {
			arrowElement.hide();
		}

	});
};

jQuery.fn.addNodeCacheMark = function (idea) {
	'use strict';
	this.data('nodeCacheMark', MAPJS.DOMRender.nodeCacheMark(idea));
};

jQuery.fn.updateNodeContent = function (nodeContent, resourceTranslator) {
	'use strict';
	var MAX_URL_LENGTH = 25,
		self = jQuery(this),
		textSpan = function () {
			var span = self.find('[data-mapjs-role=title]');
			if (span.length === 0) {
				span = jQuery('<span>').attr('data-mapjs-role', 'title').appendTo(self);
			}
			return span;
		},
		applyLinkUrl = function (title) {
			var url = MAPJS.URLHelper.getLink(title),
				element = self.find('a.mapjs-hyperlink');
			if (!url) {
				element.hide();
				return;
			}
			if (element.length === 0) {
				element = jQuery('<a target="_blank" class="mapjs-hyperlink"></a>').appendTo(self);
			}
			element.attr('href', url).show();
		},
		applyLabel = function (label) {
			var element = self.find('.mapjs-label');
			if (!label && label !== 0) {
				element.hide();
				return;
			}
			if (element.length === 0) {
				element = jQuery('<span class="mapjs-label"></span>').appendTo(self);
			}
			element.text(label).show();
		},
		applyAttachment = function () {
			var attachment = nodeContent.attr && nodeContent.attr.attachment,
				element = self.find('a.mapjs-attachment');
			if (!attachment) {
				element.hide();
				return;
			}
			if (element.length === 0) {
				element = jQuery('<a href="#" class="mapjs-attachment"></a>').appendTo(self).click(function () {
					self.trigger('attachment-click');
				});
			}
			element.show();
		},
		updateText = function (title) {
			var text = MAPJS.URLHelper.stripLink(title) ||
					(title.length < MAX_URL_LENGTH ? title : (title.substring(0, MAX_URL_LENGTH) + '...')),
					nodeTextPadding = MAPJS.DOMRender.nodeTextPadding || 11,
					element = textSpan(),
					domElement = element[0],
					height;

			element.text(text.trim());
			self.data('title', title);
			element.css({'max-width': '', 'min-width': ''});
			if ((domElement.scrollWidth - nodeTextPadding) > domElement.offsetWidth) {
				element.css('max-width', domElement.scrollWidth + 'px');
			} else {
				height = domElement.offsetHeight;
				element.css('min-width', element.css('max-width'));
				if (domElement.offsetHeight === height) {
					element.css('min-width', '');
				}
			}
		},
		setCollapseClass = function () {
			if (nodeContent.attr && nodeContent.attr.collapsed) {
				self.addClass('collapsed');
			} else {
				self.removeClass('collapsed');
			}
		},
		foregroundClass = function (backgroundColor) {
			/*jslint newcap:true*/
			var luminosity = Color(backgroundColor).mix(Color('#EEEEEE')).luminosity();
			if (luminosity < 0.5) {
				return 'mapjs-node-dark';
			} else if (luminosity < 0.9) {
				return 'mapjs-node-light';
			}
			return 'mapjs-node-white';
		},
		setColors = function () {
			var fromStyle = nodeContent.attr && nodeContent.attr.style && nodeContent.attr.style.background;
			if (fromStyle === 'false' || fromStyle === 'transparent') {
				fromStyle = false;
			}
			self.removeClass('mapjs-node-dark mapjs-node-white mapjs-node-light');
			if (fromStyle) {
				self.css('background-color', fromStyle);
				self.addClass(foregroundClass(fromStyle));
			} else {
				self.css('background-color', '');
			}
		},
		setIcon = function (icon) {
			var textBox = textSpan(),
				textHeight,
				textWidth,
				maxTextWidth,
				padding,
				selfProps = {
					'min-height': '',
					'min-width': '',
					'background-image': '',
					'background-repeat': '',
					'background-size': '',
					'background-position': ''
				},
				textProps = {
					'margin-top': '',
					'margin-left': ''
				};
			self.css({padding: ''});
			if (icon) {
				padding = parseInt(self.css('padding-left'), 10);
				textHeight = textBox.outerHeight();
				textWidth = textBox.outerWidth();
				maxTextWidth = parseInt(textBox.css('max-width'), 10);
				_.extend(selfProps, {
					'background-image': 'url("' + (resourceTranslator ? resourceTranslator(icon.url) : icon.url) + '")',
					'background-repeat': 'no-repeat',
					'background-size': icon.width + 'px ' + icon.height + 'px',
					'background-position': 'center center'
				});
				if (icon.position === 'top' || icon.position === 'bottom') {
					if (icon.position === 'top') {
						selfProps['background-position'] = 'center ' + padding + 'px';
					} else if (MAPJS.DOMRender.fixedLayout) {
						selfProps['background-position'] = 'center ' + (padding + textHeight) + 'px';
					} else {
						selfProps['background-position'] = 'center ' + icon.position + ' ' + padding + 'px';
					}

					selfProps['padding-' + icon.position] = icon.height + (padding * 2);
					selfProps['min-width'] = icon.width;
					if (icon.width > maxTextWidth) {
						textProps['margin-left'] =  (icon.width - maxTextWidth) / 2;
					}
				} else if (icon.position === 'left' || icon.position === 'right') {
					if (icon.position === 'left') {
						selfProps['background-position'] = padding + 'px center';
					} else if (MAPJS.DOMRender.fixedLayout) {
						selfProps['background-position'] = (textWidth + (2 * padding)) + 'px center ';
					} else {
						selfProps['background-position'] = icon.position + ' ' + padding + 'px center';
					}

					selfProps['padding-' + icon.position] = icon.width + (padding * 2);
					if (icon.height > textHeight) {
						textProps['margin-top'] =  (icon.height - textHeight) / 2;
						selfProps['min-height'] = icon.height;
					}
				} else {
					if (icon.height > textHeight) {
						textProps['margin-top'] =  (icon.height - textHeight) / 2;
						selfProps['min-height'] = icon.height;
					}
					selfProps['min-width'] = icon.width;
					if (icon.width > maxTextWidth) {
						textProps['margin-left'] =  (icon.width - maxTextWidth) / 2;
					}
				}
			}
			self.css(selfProps);
			textBox.css(textProps);
		};
	self.attr('mapjs-level', nodeContent.level);
	updateText(nodeContent.title);
	applyLinkUrl(nodeContent.title);
	applyLabel(nodeContent.label);
	applyAttachment();
	self.data({'x': Math.round(nodeContent.x), 'y': Math.round(nodeContent.y), 'width': Math.round(nodeContent.width), 'height': Math.round(nodeContent.height), 'nodeId': nodeContent.id})
		.addNodeCacheMark(nodeContent);
	setColors();
	setIcon(nodeContent.attr && nodeContent.attr.icon);
	setCollapseClass();
	return self;
};
jQuery.fn.placeCaretAtEnd = function () {
	'use strict';
	var el = this[0],
		range, sel, textRange;
	if (window.getSelection && document.createRange) {
		range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	} else if (document.body.createTextRange) {
		textRange = document.body.createTextRange();
		textRange.moveToElementText(el);
		textRange.collapse(false);
		textRange.select();
	}
};
jQuery.fn.selectAll = function () {
	'use strict';
	var el = this[0],
		range, sel, textRange;
	if (window.getSelection && document.createRange) {
		range = document.createRange();
		range.selectNodeContents(el);
		sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	} else if (document.body.createTextRange) {
		textRange = document.body.createTextRange();
		textRange.moveToElementText(el);
		textRange.select();
	}
};
jQuery.fn.innerText = function () {
	'use strict';
	var htmlContent = this.html(),
			containsBr = /<br\/?>/.test(htmlContent),
			containsDiv = /<div>/.test(htmlContent);
	if (containsDiv && this[0].innerText) { /* broken safari jquery text */
		return this[0].innerText.trim();
	} else if (containsBr) { /*broken firefox innerText */
		return htmlContent.replace(/<br\/?>/gi, '\n').replace(/(<([^>]+)>)/gi, '');
	}
	return this.text();
};
jQuery.fn.editNode = function (shouldSelectAll) {
	'use strict';
	var node = this,
		textBox = this.find('[data-mapjs-role=title]'),
		unformattedText = this.data('title'),
		originalText = textBox.text(),
		result = jQuery.Deferred(),
		clear = function () {
			detachListeners();
			textBox.css('word-break', '');
			textBox.removeAttr('contenteditable');
			node.shadowDraggable();
		},
		finishEditing = function () {
			var content = textBox.innerText();
			if (content === unformattedText) {
				return cancelEditing();
			}
			clear();
			result.resolve(content);
		},
		cancelEditing = function () {
			clear();
			textBox.text(originalText);
			result.reject();
		},
		keyboardEvents = function (e) {
			var ENTER_KEY_CODE = 13,
				ESC_KEY_CODE = 27,
				TAB_KEY_CODE = 9,
				S_KEY_CODE = 83,
				Z_KEY_CODE = 90;
			if (e.shiftKey && e.which === ENTER_KEY_CODE) {
				return; // allow shift+enter to break lines
			} else if (e.which === ENTER_KEY_CODE) {
				finishEditing();
				e.stopPropagation();
			} else if (e.which === ESC_KEY_CODE) {
				cancelEditing();
				e.stopPropagation();
			} else if (e.which === TAB_KEY_CODE || (e.which === S_KEY_CODE && (e.metaKey || e.ctrlKey) && !e.altKey)) {
				finishEditing();
				e.preventDefault(); /* stop focus on another object */
			} else if (!e.shiftKey && e.which === Z_KEY_CODE && (e.metaKey || e.ctrlKey) && !e.altKey) { /* undo node edit on ctrl+z if text was not changed */
				if (textBox.text() === unformattedText) {
					cancelEditing();
				}
				e.stopPropagation();
			}
		},
		attachListeners = function () {
			textBox.on('blur', finishEditing).on('keydown', keyboardEvents);
		},
		detachListeners = function () {
			textBox.off('blur', finishEditing).off('keydown', keyboardEvents);
		};
	attachListeners();
	if (unformattedText !== originalText) { /* links or some other potential formatting issues */
		textBox.css('word-break', 'break-all');
	}
	textBox.text(unformattedText).attr('contenteditable', true).focus();
	if (shouldSelectAll) {
		textBox.selectAll();
	} else if (unformattedText) {
		textBox.placeCaretAtEnd();
	}
	node.shadowDraggable({disable: true});
	return result.promise();
};
jQuery.fn.updateReorderBounds = function (border, box) {
	'use strict';
	var element = this;
	if (!border) {
		element.hide();
		return;
	}
	element.show();
	element.attr('mapjs-edge', border.edge);
	element.css({
		top: box.y + box.height / 2 - element.height() / 2,
		left: border.x - (border.edge === 'left' ? element.width() : 0)
	});

};

(function () {
	'use strict';
	var cleanDOMId = function (s) {
			return s.replace(/\./g, '_');
		},
		connectorKey = function (connectorObj) {
			return cleanDOMId('connector_' + connectorObj.from + '_' + connectorObj.to);
		},
		linkKey = function (linkObj) {
			return cleanDOMId('link_' + linkObj.ideaIdFrom + '_' + linkObj.ideaIdTo);
		},
		nodeKey = function (id) {
			return cleanDOMId('node_' + id);
		};

	jQuery.fn.createNode = function (node) {
		return jQuery('<div>')
			.attr({'id': nodeKey(node.id), 'tabindex': 0, 'data-mapjs-role': 'node' })
			.css({display: 'block', position: 'absolute'})
			.addClass('mapjs-node')
			.appendTo(this);
	};
	jQuery.fn.createConnector = function (connector) {
		return MAPJS.createSVG()
			.attr({'id': connectorKey(connector), 'data-mapjs-role': 'connector', 'class': 'mapjs-draw-container'})
			.data({'nodeFrom': this.nodeWithId(connector.from), 'nodeTo': this.nodeWithId(connector.to)})
			.appendTo(this);
	};
	jQuery.fn.createLink = function (l) {
		var defaults = _.extend({color: 'red', lineStyle: 'dashed'}, l.attr && l.attr.style);
		return MAPJS.createSVG()
			.attr({
				'id': linkKey(l),
				'data-mapjs-role': 'link',
				'class': 'mapjs-draw-container'
			})
			.data({'nodeFrom': this.nodeWithId(l.ideaIdFrom), 'nodeTo': this.nodeWithId(l.ideaIdTo) })
			.data(defaults)
			.appendTo(this);
	};
	jQuery.fn.nodeWithId = function (id) {
		return this.find('#' + nodeKey(id));
	};
	jQuery.fn.findConnector = function (connectorObj) {
		return this.find('#' + connectorKey(connectorObj));
	};
	jQuery.fn.findLink = function (linkObj) {
		return this.find('#' + linkKey(linkObj));
	};
	jQuery.fn.createReorderBounds = function () {
		var result = jQuery('<div>').attr({
			'data-mapjs-role': 'reorder-bounds',
			'class': 'mapjs-reorder-bounds'
		}).hide().css('position', 'absolute').appendTo(this);
		return result;
	};
})();

MAPJS.DOMRender.viewController = function (mapModel, stageElement, touchEnabled, imageInsertController, resourceTranslator, options) {
	'use strict';
	var viewPort = stageElement.parent(),
		connectorsForAnimation = jQuery(),
		linksForAnimation = jQuery(),
		nodeAnimOptions = { duration: 400, queue: 'nodeQueue', easing: 'linear' },
		reorderBounds = mapModel.isEditingEnabled() ? stageElement.createReorderBounds() : jQuery('<div>'),
		getViewPortDimensions = function () {
			if (viewPortDimensions) {
				return viewPortDimensions;
			}
			viewPortDimensions =  {
				left: viewPort.scrollLeft(),
				top: viewPort.scrollTop(),
				innerWidth: viewPort.innerWidth(),
				innerHeight: viewPort.innerHeight()
			};
			return viewPortDimensions;
		},
		stageToViewCoordinates = function (x, y) {
			var stage = stageElement.data(),
				scrollPosition = getViewPortDimensions();
			return {
				x: stage.scale * (x + stage.offsetX) - scrollPosition.left,
				y: stage.scale * (y + stage.offsetY) - scrollPosition.top
			};
		},
		viewToStageCoordinates = function (x, y) {
			var stage = stageElement.data(),
				scrollPosition = getViewPortDimensions();
			return {
				x: (scrollPosition.left + x) / stage.scale - stage.offsetX,
				y: (scrollPosition.top + y) / stage.scale - stage.offsetY
			};
		},
		updateScreenCoordinates = function () {
			var element = jQuery(this);
			element.css({
				'left': element.data('x'),
				'top' : element.data('y')
			}).trigger('mapjs:move');
		},
		animateToPositionCoordinates = function () {
			var element = jQuery(this);
			element.clearQueue(nodeAnimOptions.queue).animate({
				'left': element.data('x'),
				'top' : element.data('y'),
				'opacity': 1 /* previous animation can be cancelled with clearqueue, so ensure it gets visible */
			}, _.extend({
				complete: function () {
					element.css('opacity', '');
					element.each(updateScreenCoordinates);
				}
			}, nodeAnimOptions)).trigger('mapjs:animatemove');
		},
		ensureSpaceForPoint = function (x, y) {/* in stage coordinates */
			var stage = stageElement.data(),
				dirty = false;
			if (x < -1 * stage.offsetX) {
				stage.width =  stage.width - stage.offsetX - x;
				stage.offsetX = -1 * x;
				dirty = true;
			}
			if (y < -1 * stage.offsetY) {
				stage.height = stage.height - stage.offsetY - y;
				stage.offsetY = -1 * y;
				dirty = true;
			}
			if (x > stage.width - stage.offsetX) {
				stage.width = stage.offsetX + x;
				dirty = true;
			}
			if (y > stage.height - stage.offsetY) {
				stage.height = stage.offsetY + y;
				dirty = true;
			}
			if (dirty) {
				stageElement.updateStage();
			}
		},
		ensureSpaceForNode = function () {
			return jQuery(this).each(function () {
				var node = jQuery(this).data(),
					margin = MAPJS.DOMRender.stageMargin || {top: 0, left: 0, bottom: 0, right: 0};
				/* sequence of calculations is important because maxX and maxY take into consideration the new offsetX snd offsetY */
				ensureSpaceForPoint(node.x - margin.left, node.y - margin.top);
				ensureSpaceForPoint(node.x + node.width + margin.right, node.y + node.height + margin.bottom);
			});
		},
		centerViewOn = function (x, y, animate) { /*in the stage coordinate system*/
			var stage = stageElement.data(),
				viewPortCenter = {
					x: viewPort.innerWidth() / 2,
					y: viewPort.innerHeight() / 2
				},
				newLeftScroll, newTopScroll,
				margin = MAPJS.DOMRender.stageVisibilityMargin || {top: 0, left: 0, bottom: 0, right: 0};
			ensureSpaceForPoint(x - viewPortCenter.x / stage.scale, y - viewPortCenter.y / stage.scale);
			ensureSpaceForPoint(x + viewPortCenter.x / stage.scale - margin.left, y + viewPortCenter.y / stage.scale - margin.top);

			newLeftScroll = stage.scale * (x + stage.offsetX) - viewPortCenter.x;
			newTopScroll = stage.scale * (y + stage.offsetY) - viewPortCenter.y;
			viewPort.finish();
			if (animate) {
				viewPort.animate({
					scrollLeft: newLeftScroll,
					scrollTop: newTopScroll
				}, {
					duration: 400
				});
			} else {
				viewPort.scrollLeft(newLeftScroll);
				viewPort.scrollTop(newTopScroll);
			}
		},
		stagePointAtViewportCenter = function () {
			return viewToStageCoordinates(viewPort.innerWidth() / 2, viewPort.innerHeight() / 2);
		},
		ensureNodeVisible = function (domElement) {
			if (!domElement || domElement.length === 0) {
				return;
			}
			viewPort.finish();
			var node = domElement.data(),
				nodeTopLeft = stageToViewCoordinates(node.x, node.y),
				nodeBottomRight = stageToViewCoordinates(node.x + node.width, node.y + node.height),
				animation = {},
				margin = MAPJS.DOMRender.stageVisibilityMargin || {top: 10, left: 10, bottom: 10, right: 10};
			if ((nodeTopLeft.x - margin.left) < 0) {
				animation.scrollLeft = viewPort.scrollLeft() + nodeTopLeft.x - margin.left;
			} else if ((nodeBottomRight.x + margin.right) > viewPort.innerWidth()) {
				animation.scrollLeft = viewPort.scrollLeft() + nodeBottomRight.x - viewPort.innerWidth() + margin.right;
			}
			if ((nodeTopLeft.y - margin.top) < 0) {
				animation.scrollTop = viewPort.scrollTop() + nodeTopLeft.y - margin.top;
			} else if ((nodeBottomRight.y + margin.bottom) > viewPort.innerHeight()) {
				animation.scrollTop = viewPort.scrollTop() + nodeBottomRight.y - viewPort.innerHeight() + margin.bottom;
			}
			if (!_.isEmpty(animation)) {
				viewPort.animate(animation, {duration: 100});
			}
		},
		viewportCoordinatesForPointEvent = function (evt) {
			var dropPosition = (evt && evt.gesture && evt.gesture.center) || evt,
				vpOffset = viewPort.offset(),
				result;
			if (dropPosition) {
				result = {
					x: dropPosition.pageX - vpOffset.left,
					y: dropPosition.pageY -  vpOffset.top
				};
				if (result.x >= 0 && result.x <= viewPort.innerWidth() && result.y >= 0 && result.y <= viewPort.innerHeight()) {
					return result;
				}
			}
		},
		stagePositionForPointEvent = function (evt) {
			var viewportDropCoordinates = viewportCoordinatesForPointEvent(evt);
			if (viewportDropCoordinates) {
				return viewToStageCoordinates(viewportDropCoordinates.x, viewportDropCoordinates.y);
			}
		},
		clearCurrentDroppable = function () {
			if (currentDroppable || currentDroppable === false) {
				jQuery('.mapjs-node').removeClass('droppable');
				currentDroppable = undefined;
			}
		},
		showDroppable = function (nodeId) {
			stageElement.nodeWithId(nodeId).addClass('droppable');
			currentDroppable = nodeId;
		},
		currentDroppable = false,
		viewPortDimensions,
		withinReorderBoundary = function (boundaries, box) {
			if (_.isEmpty(boundaries)) {
				return false;
			}
			if (!box) {
				return false;
			}
			var closeTo = function (reorderBoundary) {
					var nodeX = box.x;
					if (reorderBoundary.edge === 'right') {
						nodeX += box.width;
					}
					return Math.abs(nodeX - reorderBoundary.x) < reorderBoundary.margin * 2 &&
						box.y < reorderBoundary.maxY &&
						box.y > reorderBoundary.minY;
				};
			return _.find(boundaries, closeTo);
		};


	viewPort.on('scroll', function () {
		viewPortDimensions = undefined;
	});
	if (imageInsertController) {
		imageInsertController.addEventListener('imageInserted', function (dataUrl, imgWidth, imgHeight, evt) {
			var point = stagePositionForPointEvent(evt);
			mapModel.dropImage(dataUrl, imgWidth, imgHeight, point && point.x, point && point.y);
		});
	}
	mapModel.addEventListener('nodeCreated', function (node) {
		var currentReorderBoundary,
			element = stageElement.createNode(node)
			.queueFadeIn(nodeAnimOptions)
			.updateNodeContent(node, resourceTranslator)
			.on('tap', function (evt) {

				var realEvent = (evt.gesture && evt.gesture.srcEvent) || evt;
				if (realEvent.button && realEvent.button !== -1) {
					return;
				}
				mapModel.clickNode(node.id, realEvent);
				if (evt) {
					evt.stopPropagation();
				}
				if (evt && evt.gesture) {
					evt.gesture.stopPropagation();
				}

			})
			.on('doubletap', function (event) {
				if (event) {
					event.stopPropagation();
					if (event.gesture) {
						event.gesture.stopPropagation();
					}
				}
				if (!mapModel.isEditingEnabled()) {
					mapModel.toggleCollapse('mouse');
					return;
				}
				mapModel.editNode('mouse');
			})
			.on('attachment-click', function () {
				mapModel.openAttachment('mouse', node.id);
			})
			.each(ensureSpaceForNode)
			.each(updateScreenCoordinates)
			.on('mm:start-dragging mm:start-dragging-shadow', function () {
				mapModel.selectNode(node.id);
				currentReorderBoundary = mapModel.getReorderBoundary(node.id);
				element.addClass('dragging');
			})
			.on('mm:drag', function (evt) {
				var dropCoords = stagePositionForPointEvent(evt),
					currentPosition = evt.currentPosition && stagePositionForPointEvent({pageX: evt.currentPosition.left, pageY: evt.currentPosition.top}),
					nodeId,
					hasShift = evt && evt.gesture && evt.gesture.srcEvent && evt.gesture.srcEvent.shiftKey,
					border;
				if (!dropCoords) {
					clearCurrentDroppable();
					return;
				}

				nodeId = mapModel.getNodeIdAtPosition(dropCoords.x, dropCoords.y);
				if (!hasShift && !nodeId && currentPosition) {
					currentPosition.width = element.outerWidth();
					currentPosition.height = element.outerHeight();
					border = withinReorderBoundary(currentReorderBoundary, currentPosition);
					reorderBounds.updateReorderBounds(border, currentPosition);
				} else {
					reorderBounds.hide();
				}
				if (!nodeId || nodeId === node.id) {
					clearCurrentDroppable();
				} else if (nodeId !== currentDroppable) {
					clearCurrentDroppable();
					if (nodeId) {
						showDroppable(nodeId);
					}
				}
			})
			.on('contextmenu', function (event) {
				mapModel.selectNode(node.id);
				if (mapModel.requestContextMenu(event.pageX, event.pageY)) {
					event.preventDefault();
					return false;
				}
			})
			.on('mm:stop-dragging', function (evt) {
				element.removeClass('dragging');
				reorderBounds.hide();
				var isShift = evt && evt.gesture && evt.gesture.srcEvent && evt.gesture.srcEvent.shiftKey,
					stageDropCoordinates = stagePositionForPointEvent(evt),
					nodeAtDrop, finalPosition, dropResult, manualPosition, vpCenter;
				clearCurrentDroppable();
				if (!stageDropCoordinates) {
					return;
				}
				nodeAtDrop = mapModel.getNodeIdAtPosition(stageDropCoordinates.x, stageDropCoordinates.y);
				finalPosition = stagePositionForPointEvent({pageX: evt.finalPosition.left, pageY: evt.finalPosition.top});
				if (nodeAtDrop && nodeAtDrop !== node.id) {
					dropResult = mapModel.dropNode(node.id, nodeAtDrop, !!isShift);
				} else if (node.level > 1) {
					finalPosition.width = element.outerWidth();
					finalPosition.height = element.outerHeight();
					manualPosition = (!!isShift) || !withinReorderBoundary(currentReorderBoundary, finalPosition);
					dropResult = mapModel.positionNodeAt(node.id, finalPosition.x, finalPosition.y, manualPosition);
				} else if (node.level === 1 && evt.gesture) {
					vpCenter = stagePointAtViewportCenter();
					vpCenter.x -= evt.gesture.deltaX || 0;
					vpCenter.y -= evt.gesture.deltaY || 0;
					centerViewOn(vpCenter.x, vpCenter.y, true);
					dropResult = true;
				} else {
					dropResult = false;
				}
				return dropResult;
			})
			.on('mm:cancel-dragging', function () {
				clearCurrentDroppable();
				element.removeClass('dragging');
				reorderBounds.hide();
			});
		if (touchEnabled) {
			element.on('hold', function (evt) {
				var realEvent = (evt.gesture && evt.gesture.srcEvent) || evt;
				mapModel.clickNode(node.id, realEvent);
				if (mapModel.requestContextMenu(evt.gesture.center.pageX, evt.gesture.center.pageY)) {
					evt.preventDefault();
					if (evt.gesture) {
						evt.gesture.preventDefault();
						evt.gesture.stopPropagation();
					}
					return false;
				}
			});
		}
		element.css('min-width', element.css('width'));
		if (mapModel.isEditingEnabled()) {
			element.shadowDraggable();
		}
	});
	mapModel.addEventListener('nodeSelectionChanged', function (ideaId, isSelected) {
		var node = stageElement.nodeWithId(ideaId);
		if (isSelected) {
			node.addClass('selected');
			ensureNodeVisible(node);
		} else {
			node.removeClass('selected');
		}
	});
	mapModel.addEventListener('nodeRemoved', function (node) {
		stageElement.nodeWithId(node.id).queueFadeOut(nodeAnimOptions);
	});
	mapModel.addEventListener('nodeMoved', function (node /*, reason*/) {
		var currentViewPortDimensions = getViewPortDimensions(),
			nodeDom = stageElement.nodeWithId(node.id).data({
				'x': Math.round(node.x),
				'y': Math.round(node.y)
			}).each(ensureSpaceForNode),
			screenTopLeft = stageToViewCoordinates(Math.round(node.x), Math.round(node.y)),
			screenBottomRight = stageToViewCoordinates(Math.round(node.x + node.width), Math.round(node.y + node.height));
		if (screenBottomRight.x < 0 || screenBottomRight.y < 0 || screenTopLeft.x > currentViewPortDimensions.innerWidth || screenTopLeft.y > currentViewPortDimensions.innerHeight) {
			nodeDom.each(updateScreenCoordinates);
		} else {
			nodeDom.each(animateToPositionCoordinates);
		}
	});
	mapModel.addEventListener('nodeTitleChanged nodeAttrChanged nodeLabelChanged', function (n) {
		stageElement.nodeWithId(n.id).updateNodeContent(n, resourceTranslator);
	});
	mapModel.addEventListener('connectorCreated', function (connector) {
		var element = stageElement.createConnector(connector).queueFadeIn(nodeAnimOptions).updateConnector(true);
		stageElement.nodeWithId(connector.from).add(stageElement.nodeWithId(connector.to))
			.on('mapjs:move', function () {
				element.updateConnector(true);
			})
			.on('mm:drag', function () {
				element.updateConnector();
			})
			.on('mapjs:animatemove', function () {
				connectorsForAnimation = connectorsForAnimation.add(element);
			});
	});
	mapModel.addEventListener('connectorRemoved', function (connector) {
		stageElement.findConnector(connector).queueFadeOut(nodeAnimOptions);
	});
	mapModel.addEventListener('linkCreated', function (l) {
		var link = stageElement.createLink(l).queueFadeIn(nodeAnimOptions).updateLink();
		link.find('.mapjs-link-hit').on('tap', function (event) {
			mapModel.selectLink('mouse', l, { x: event.gesture.center.pageX, y: event.gesture.center.pageY });
			event.stopPropagation();
			event.gesture.stopPropagation();
		});
		stageElement.nodeWithId(l.ideaIdFrom).add(stageElement.nodeWithId(l.ideaIdTo))
			.on('mapjs:move mm:drag', function () {
				link.updateLink();
			})
			.on('mapjs:animatemove', function () {
				linksForAnimation = linksForAnimation.add(link);
			});

	});
	mapModel.addEventListener('linkRemoved', function (l) {
		stageElement.findLink(l).queueFadeOut(nodeAnimOptions);
	});
	mapModel.addEventListener('mapScaleChanged', function (scaleMultiplier /*, zoomPoint */) {
		var currentScale = stageElement.data('scale'),
			targetScale = Math.max(Math.min(currentScale * scaleMultiplier, 5), 0.2),
			currentCenter = stagePointAtViewportCenter();
		if (currentScale === targetScale) {
			return;
		}
		stageElement.data('scale', targetScale).updateStage();
		centerViewOn(currentCenter.x, currentCenter.y);
	});
	mapModel.addEventListener('nodeVisibilityRequested', function (ideaId) {
		var id = ideaId || mapModel.getCurrentlySelectedIdeaId(),
				node = stageElement.nodeWithId(id);
		if (node) {
			ensureNodeVisible(node);
			viewPort.finish();
		}

	});
	mapModel.addEventListener('nodeFocusRequested', function (ideaId) {
		var node = stageElement.nodeWithId(ideaId).data(),
			nodeCenterX = node.x + node.width / 2,
			nodeCenterY = node.y + node.height / 2;
		if (stageElement.data('scale') !== 1) {
			stageElement.data('scale', 1).updateStage();
		}
		centerViewOn(nodeCenterX, nodeCenterY, true);
	});
	mapModel.addEventListener('mapViewResetRequested', function () {
		stageElement.data({'scale': 1, 'height': 0, 'width': 0, 'offsetX': 0, 'offsetY': 0}).updateStage();
		stageElement.children().andSelf().finish(nodeAnimOptions.queue);
		jQuery(stageElement).find('.mapjs-node').each(ensureSpaceForNode);
		jQuery(stageElement).find('[data-mapjs-role=connector]').updateConnector(true);
		jQuery(stageElement).find('[data-mapjs-role=link]').updateLink();
		centerViewOn(0, 0);
		viewPort.focus();
	});
	mapModel.addEventListener('layoutChangeStarting', function () {
		viewPortDimensions = undefined;
		stageElement.children().finish(nodeAnimOptions.queue);
		stageElement.finish(nodeAnimOptions.queue);
	});
	mapModel.addEventListener('layoutChangeComplete', function () {
		var connectorGroupClone = jQuery(), linkGroupClone = jQuery();

		connectorsForAnimation.each(function () {
			if (!jQuery(this).animateConnectorToPosition(nodeAnimOptions, 2)) {
				connectorGroupClone = connectorGroupClone.add(this);
			}
		});
		linksForAnimation.each(function () {
			if (!jQuery(this).animateConnectorToPosition(nodeAnimOptions, 2)) {
				linkGroupClone = linkGroupClone.add(this);
			}
		});
		connectorsForAnimation = jQuery();
		linksForAnimation = jQuery();
		stageElement.animate({'opacity': 1}, _.extend({
			progress: function () {
				connectorGroupClone.updateConnector();
				linkGroupClone.updateLink();
			}
		}, nodeAnimOptions));
		ensureNodeVisible(stageElement.nodeWithId(mapModel.getCurrentlySelectedIdeaId()));
		stageElement.children().dequeue(nodeAnimOptions.queue);
		stageElement.dequeue(nodeAnimOptions.queue);
	});

	/* editing */
	if (!options || !options.inlineEditingDisabled) {
		mapModel.addEventListener('nodeEditRequested', function (nodeId, shouldSelectAll, editingNew) {
			var editingElement = stageElement.nodeWithId(nodeId);
			mapModel.setInputEnabled(false);
			viewPort.finish(); /* close any pending animations */
			editingElement.editNode(shouldSelectAll).done(
				function (newText) {
					mapModel.setInputEnabled(true);
					mapModel.updateTitle(nodeId, newText, editingNew);
					editingElement.focus();

				}).fail(function () {
					mapModel.setInputEnabled(true);
					if (editingNew) {
						mapModel.undo('internal');
					}
					editingElement.focus();
				});
		});
	}
	mapModel.addEventListener('addLinkModeToggled', function (isOn) {
		if (isOn) {
			stageElement.addClass('mapjs-add-link');
		} else {
			stageElement.removeClass('mapjs-add-link');
		}
	});
	mapModel.addEventListener('linkAttrChanged', function (l) {
		var  attr = _.extend({arrow: false}, l.attr && l.attr.style);
		stageElement.findLink(l).data(attr).updateLink();
	});

	mapModel.addEventListener('activatedNodesChanged', function (activatedNodes, deactivatedNodes) {
		_.each(activatedNodes, function (nodeId) {
			stageElement.nodeWithId(nodeId).addClass('activated');
		});
		_.each(deactivatedNodes, function (nodeId) {
			stageElement.nodeWithId(nodeId).removeClass('activated');
		});
	});
};

/*jslint nomen: true, newcap: true, browser: true*/
/*global MAPJS, $, _, jQuery*/

jQuery.fn.scrollWhenDragging = function (scrollPredicate) {
	/*jslint newcap:true*/
	'use strict';
	return this.each(function () {
		var element = $(this),
			dragOrigin;
		element.on('dragstart', function () {
			if (scrollPredicate()) {
				dragOrigin = {
					top: element.scrollTop(),
					left: element.scrollLeft()
				};
			}
		}).on('drag', function (e) {
			if (e.gesture && dragOrigin) {
				element.scrollTop(dragOrigin.top - e.gesture.deltaY);
				element.scrollLeft(dragOrigin.left - e.gesture.deltaX);
			}
		}).on('dragend', function () {
			dragOrigin = undefined;
		});
	});
};
$.fn.domMapWidget = function (activityLog, mapModel, touchEnabled, imageInsertController, dragContainer, resourceTranslator, centerSelectedNodeOnOrientationChange, options) {
	'use strict';
	var hotkeyEventHandlers = {
			'return': 'addSiblingIdea',
			'shift+return': 'addSiblingIdeaBefore',
			'del backspace': 'removeSubIdea',
			'tab insert': 'addSubIdea',
			'left': 'selectNodeLeft',
			'up': 'selectNodeUp',
			'right': 'selectNodeRight',
			'shift+right': 'activateNodeRight',
			'shift+left': 'activateNodeLeft',
			'meta+right ctrl+right meta+left ctrl+left': 'flip',
			'shift+up': 'activateNodeUp',
			'shift+down': 'activateNodeDown',
			'down': 'selectNodeDown',
			'space f2': 'editNode',
			'f': 'toggleCollapse',
			'c meta+x ctrl+x': 'cut',
			'p meta+v ctrl+v': 'paste',
			'y meta+c ctrl+c': 'copy',
			'u meta+z ctrl+z': 'undo',
			'shift+tab': 'insertIntermediate',
			'Esc 0 meta+0 ctrl+0': 'resetView',
			'r meta+shift+z ctrl+shift+z meta+y ctrl+y': 'redo',
			'meta+plus ctrl+plus z': 'scaleUp',
			'meta+minus ctrl+minus shift+z': 'scaleDown',
			'meta+up ctrl+up': 'moveUp',
			'meta+down ctrl+down': 'moveDown',
			'ctrl+shift+v meta+shift+v': 'pasteStyle',
			'Esc': 'cancelCurrentAction'
		},
		charEventHandlers = {
			'[' : 'activateChildren',
			'{'	: 'activateNodeAndChildren',
			'='	: 'activateSiblingNodes',
			'.'	: 'activateSelectedNode',
			'/' : 'toggleCollapse',
			'a' : 'openAttachment',
			'i' : 'editIcon'
		},
		actOnKeys = true,
		self = this;
	mapModel.addEventListener('inputEnabledChanged', function (canInput, holdFocus) {
		actOnKeys = canInput;
		if (canInput && !holdFocus) {
			self.focus();
		}
	});

	return this.each(function () {
		var element = $(this),
			stage = $('<div>').css({
				position: 'relative'
			}).attr('data-mapjs-role', 'stage').appendTo(element).data({
				'offsetX': element.innerWidth() / 2,
				'offsetY': element.innerHeight() / 2,
				'width': element.innerWidth() - 20,
				'height': element.innerHeight() - 20,
				'scale': 1
			}).updateStage(),
			previousPinchScale = false;
		element.css('overflow', 'auto').attr('tabindex', 1);
		if (mapModel.isEditingEnabled()) {
			(dragContainer || element).simpleDraggableContainer();
		}

		if (!touchEnabled) {
			element.scrollWhenDragging(mapModel.getInputEnabled); //no need to do this for touch, this is native
			element.on('mousedown', function (e) {
				if (e.target !== element[0]) {
					element.css('overflow', 'hidden');
				}
			});
			jQuery(document).on('mouseup', function () {
				if (element.css('overflow') !== 'auto') {
					element.css('overflow', 'auto');
				}
			});
			element.imageDropWidget(imageInsertController);
		} else {
			element.on('doubletap', function (event) {
				if (mapModel.requestContextMenu(event.gesture.center.pageX, event.gesture.center.pageY)) {
					event.preventDefault();
					event.gesture.preventDefault();
					return false;
				}
			}).on('pinch', function (event) {
				if (!event || !event.gesture || !event.gesture.scale) {
					return;
				}
				event.preventDefault();
				event.gesture.preventDefault();

				var scale = event.gesture.scale;
				if (previousPinchScale) {
					scale = scale / previousPinchScale;
				}
				if (Math.abs(scale - 1) < 0.05) {
					return;
				}
				previousPinchScale = event.gesture.scale;

				mapModel.scale('touch', scale, {
					x: event.gesture.center.pageX - stage.data('offsetX'),
					y: event.gesture.center.pageY - stage.data('offsetY')
				});
			}).on('gestureend', function () {
				previousPinchScale = false;
			});

		}
		MAPJS.DOMRender.viewController(mapModel, stage, touchEnabled, imageInsertController, resourceTranslator, options);
		_.each(hotkeyEventHandlers, function (mappedFunction, keysPressed) {
			element.keydown(keysPressed, function (event) {
				if (actOnKeys) {
					event.stopImmediatePropagation();
					event.preventDefault();
					mapModel[mappedFunction]('keyboard');
				}
			});
		});
		if (!touchEnabled) {
			jQuery(window).on('resize', function () {
				mapModel.resetView();
			});
		}

		jQuery(window).on('orientationchange', function () {
			if (centerSelectedNodeOnOrientationChange) {
				mapModel.centerOnNode(mapModel.getSelectedNodeId());
			} else {
				mapModel.resetView();
			}

		});
		jQuery(document).on('keydown', function (e) {
			var functions = {
				'U+003D': 'scaleUp',
				'U+002D': 'scaleDown',
				61: 'scaleUp',
				173: 'scaleDown'
			}, mappedFunction;
			if (e && !e.altKey && (e.ctrlKey || e.metaKey)) {
				if (e.originalEvent && e.originalEvent.keyIdentifier) { /* webkit */
					mappedFunction = functions[e.originalEvent.keyIdentifier];
				} else if (e.key === 'MozPrintableKey') {
					mappedFunction = functions[e.which];
				}
				if (mappedFunction) {
					if (actOnKeys) {
						e.preventDefault();
						mapModel[mappedFunction]('keyboard');
					}
				}
			}
		}).on('wheel mousewheel', function (e) {
			var scroll = e.originalEvent.deltaX || (-1 * e.originalEvent.wheelDeltaX);
			if (scroll < 0 && element.scrollLeft() === 0) {
				e.preventDefault();
			}
			if (scroll > 0 && (element[0].scrollWidth - element.width() - element.scrollLeft() === 0)) {
				e.preventDefault();
			}
		});

		element.on('keypress', function (evt) {
			if (!actOnKeys) {
				return;
			}
			if (/INPUT|TEXTAREA/.test(evt && evt.target && evt.target.tagName)) {
				return;
			}
			var unicode = evt.charCode || evt.keyCode,
				actualkey = String.fromCharCode(unicode),
				mappedFunction = charEventHandlers[actualkey];
			if (mappedFunction) {
				evt.preventDefault();
				mapModel[mappedFunction]('keyboard');
			} else if (Number(actualkey) <= 9 && Number(actualkey) >= 1) {
				evt.preventDefault();
				mapModel.activateLevel('keyboard', Number(actualkey) + 1);
			}
		});
	});
};

/**
 *MindMup API
 *@module MM
 *@main MM
 */
var MM = MM || {};


/*global MM, observable*/

MM.ActiveContentListener = function (mapController) {
	'use strict';
	var self = observable(this),
		activeContent,
		onChanged = function (method, attrs) {
			self.dispatchEvent('mm-active-content-changed', activeContent, false, method, attrs);
		},
		onMapLoaded = function (newMapId, content) {
			if (activeContent) {
				activeContent.removeEventListener('changed', onChanged);
			}
			activeContent = content;
			self.dispatchEvent('mm-active-content-changed', activeContent, true);
			activeContent.addEventListener('changed', onChanged);
		};
	mapController.addEventListener('mapLoaded', onMapLoaded, 999);
	self.getActiveContent = function () {
		return activeContent;
	};
	self.addListener = function (onActiveContentChanged) {
		if (activeContent) {
			onActiveContentChanged(activeContent, false);
		}
		self.addEventListener('mm-active-content-changed', onActiveContentChanged);

	};
};

/*global MM */
MM.ActiveContentResourceManager = function (activeContentListener, prefixTemplate) {
	'use strict';
	var self = this,
		prefix = prefixTemplate + ':',
		prefixMatcher = new RegExp('^' + prefix);
	self.storeResource = function (resourceURL) {
		return prefix + activeContentListener.getActiveContent().storeResource(resourceURL);
	};
	self.getResource = function (resourceURL) {
		if (prefixMatcher.test(resourceURL)) {
			return activeContentListener.getActiveContent().getResource(resourceURL.substring(prefix.length));
		} else {
			return resourceURL;
		}
	};
};

/*global jQuery, MM, observable*/
/**
 * Utility logging class that can dispatch events. Used by other classes
 * as a central tracking and analytics mechanism. Caches a list of most
 * recent events in memory for troubleshooting purposes.
 *
 * @class ActivityLog
 * @constructor
 * @param {int} maxNumberOfElements the maximum number of elements to keep in memory
 */
MM.ActivityLog = function (maxNumberOfElements) {
	'use strict';
	var activityLog = [], nextId = 1, self = this;
	observable(this);
    /**
     * Tracks an event and dispatches a **log** event to all observers.
     *
     * @method log
     * @param {String} ...args a list of arguments to log. By convention, the first argument is a category, the second is an action, the others are arbitrary strings
     */
	this.log = function () {
		var analyticArgs = ['log'];
		if (activityLog.length === maxNumberOfElements) {
			activityLog.shift();
		}
		activityLog.push({
			id: nextId,
			ts: new Date(),
			event: Array.prototype.join.call(arguments, ',')
		});
		nextId += 1;
		Array.prototype.slice.call(arguments).forEach(function (element) {
			if (jQuery.isArray(element)) {
				analyticArgs = analyticArgs.concat(element);
			} else {
				analyticArgs.push(element);
			}
		});
		self.dispatchEvent.apply(self, analyticArgs);
	};
    /**
     * Shorthand error logging method, it will call log with an Error category and dispatch a separate **error** event
     * @method error
     */
	this.error = function (message) {
		self.log('Error', message);
		self.dispatchEvent('error', message, activityLog);
	};
    /**
     * Utility method to look at the list of most recent events
     *
     * @method getLog
     * @return the list of most recent events
     */
	this.getLog = activityLog.slice.bind(activityLog);
    /**
     * Starts an asynchronous timer - can be stopped at a later point.
     * @method timer
     * @param {String} category the category to log
     * @param {String} action the action to log
     * @return javascript object with an **end** method, which will stop the timer and log the total number of milliseconds taken since start
     */
	this.timer = function (category, action) {
		var start = Date.now();
		return {
			end: function () {
				self.dispatchEvent('timer', category, action, Date.now() - start);
			}
		};
	};
};
jQuery.fn.trackingWidget = function (activityLog) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
			category = element.data('category'),
			eventType = element.data('event-type') || '',
			label = element.data('label') || '';
		element.click(function () {
			activityLog.log(category, eventType, label);
		});
	});
};

/*global MM, jQuery, XMLHttpRequest*/
MM.ajaxBlobFetch = function (url) {
	'use strict';
	// jQuery ajax does not support binary transport yet
	var http = new XMLHttpRequest(),
			result = jQuery.Deferred();

	http.addEventListener('load', function () {
		if (http.status === 200) {
			result.resolve(http.response, http.getResponseHeader('content-type'));
		} else {
			result.reject(http, http.statusText, http.status);
		}
	});
	http.addEventListener('error', function () {
		result.reject(http, http.statusText, http.status);
	});
	http.addEventListener('abort', function () {
		result.reject(http, http.statusText, http.status);
	});
	http.addEventListener('progress', function (oEvent) {
		if (oEvent.lengthComputable) {
			result.notify(Math.round((oEvent.loaded * 100) / oEvent.total, 2) + '%');
		} else {
			result.notify();
		}
	});
	http.open('GET', url, true);
	http.responseType = 'blob';
	http.send();
	return result.promise();
};

/*global jQuery, MM, observable, setTimeout, _ */
MM.Alert = function () {
	'use strict';
	var self = this, lastId = 1;
	observable(this);
	this.show = function (message, detail, type) {
		var currentId = lastId;
		lastId += 1;
		self.dispatchEvent('shown', currentId, message, detail, type === 'flash' ? 'info' : type);
		if (type === 'flash') {
			setTimeout(function () {
				self.hide(currentId);
			}, 3000);
		}
		return currentId;
	};
	this.hide = this.dispatchEvent.bind(this, 'hidden');
};
jQuery.fn.alertWidget = function (alert) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this);
		alert.addEventListener('shown', function (id, message, detail, type) {
			type = type || 'info';
			detail = detail || '';
			if (_.isString(message)) {
				message = jQuery('<span><strong>' + message + '</strong>&nbsp;' + detail + '</span>');
			}
			jQuery('<div class="alert fade in">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'</div>')
				.addClass('alert-' + type + ' alert-no-' + id)
				.append(message).appendTo(element);
		});
		alert.addEventListener('hidden', function (id) {
			element.find('.alert-no-' + id).remove();
		});
	});
};

/*global jQuery*/
jQuery.fn.anonSaveAlertWidget = function (alertController, mapController, mapSource, propertyStorage, propertyName) {
	'use strict';
	var saveTemplate = this.find('[data-mm-role=anon-save]').detach(),
		destroyedTemplate = this.find('[data-mm-role=destroyed]').detach(),
		destroyedProblemTemplate = this.find('[data-mm-role=destroyed-problem]').detach(),
		currentAlertId,
		enabled = function () {
			return !propertyStorage.getItem(propertyName);
		},
		hideAlert = function () {
			if (currentAlertId) {
				alertController.hide(currentAlertId);
				currentAlertId = undefined;
			}
		};
	mapController.addEventListener('mapSaving mapLoaded', hideAlert);
	mapController.addEventListener('mapSaved', function (mapId) {
		var hideAndDisable = function () {
				hideAlert();
				propertyStorage.setItem(propertyName, true);
			},
			show = function (messageTemplate, type) {
				if (currentAlertId) {
					alertController.hide(currentAlertId);
				}
				var clone = messageTemplate.clone();
				clone.find('[data-mm-role=donotshow]').click(hideAndDisable);
				clone.find('[data-mm-role=destroy]').click(hideAndDestroy);
				currentAlertId = alertController.show(clone, '', type);
			},
			hideAndDestroy = function () {
				mapSource.destroyLastSave().then(function () {
					show(destroyedTemplate, 'info');
				}, function () {
					show(destroyedProblemTemplate, 'error');
				});
			};
		if (enabled() && mapSource.recognises(mapId)) {
			show(saveTemplate, 'success');
		}
	});
};

/* global jQuery, MM */
jQuery.fn.atlasPrepopulationWidget = function (activeContentListener, titleLengthLimit, descriptionLengthLimit, truncFunction, sanitizeFunction) {
	'use strict';
	truncFunction = truncFunction || MM.AtlasUtil.truncate;
	sanitizeFunction = sanitizeFunction || MM.AtlasUtil.sanitize;
	var self = this,
			fillInValues = function () {
				var form = self.find('form[data-mm-role~=atlas-metadata]'),
						idea = activeContentListener.getActiveContent(),
						title = idea && idea.title,
						saneTitle = truncFunction(title, titleLengthLimit),
						saneDescription = truncFunction('MindMup mind map: ' + title, descriptionLengthLimit),
						saneSlug = sanitizeFunction(truncFunction(title, titleLengthLimit));

				form.find('[name=title]').attr('placeholder', saneTitle).val(saneTitle);
				form.find('[name=description]').attr('placeholder', saneDescription).val(saneDescription);
				form.find('[name=slug]').attr('placeholder', saneSlug).val(saneSlug);
			};
	self.on('show', function (evt) {
		if (this === evt.target) {
			fillInValues();
		}
	});
	return self;
};
MM.AtlasUtil = {
	truncate: function (str, length) {
		'use strict';
		return str.substring(0, length);
	},
	sanitize: function (s) {
		'use strict';
		var slug = s.substr(0, 100).toLowerCase().replace(/[^a-z0-9]+/g, '_');
		return slug === '_' ? 'map' : slug;
	}
};

/*global $*/
/*jslint browser:true*/
$.fn.attachmentEditorWidget = function (mapModel, isTouch) {
	'use strict';
	var element = this,
		shader = $('<div>').addClass('modal-backdrop fade in hide').appendTo('body'),
		editorArea = element.find('[data-mm-role=editor]'),
		ideaId,
		close = function () {
			shader.hide();
			mapModel.setInputEnabled(true);
			element.hide();
			editorArea.html('');
		},
		isEditing,
		switchToEditMode = function () {
			editorArea.attr('contenteditable', true);
			element.addClass('mm-editable');
			editorArea.focus();
			isEditing = true;
		},
		switchToViewMode = function () {
			element.removeClass('mm-editable');
			editorArea.attr('contenteditable', false);
			editorArea.find('a').attr('target', '_blank');
			isEditing = false;
			editorArea.focus();
		},
		save = function () {
			var newContent = editorArea.cleanHtml();
			if (newContent) {
				mapModel.setAttachment('attachmentEditorWidget', ideaId, {contentType: 'text/html', content: newContent });
				close();
			} else {
				mapModel.setAttachment('attachmentEditorWidget', ideaId, false);
				close();
			}
		},
		clear = function () {
			editorArea.html('');
		},
		sizeEditor = function () {
			var margin = editorArea.outerHeight(true) - editorArea.innerHeight() + 30;
			editorArea.height(element.innerHeight() - editorArea.siblings().outerHeight(true) - margin);
			$('[data-role=editor-toolbar] [data-role=magic-overlay]').each(function () {
				var overlay = $(this), target = $(overlay.data('target'));
				overlay.css('opacity', 0).css('position', 'absolute')
					.offset(target.offset()).width(target.outerWidth()).height(target.outerHeight());
			});
			shader.width('100%').height('100%');
		},

		open = function (activeIdea, attachment) {
			var contentType = attachment && attachment.contentType;
			shader.show();
			ideaId = activeIdea;
			element.show();
			sizeEditor();
			mapModel.setInputEnabled(false);
			if (!attachment) {
				switchToEditMode();
			} else if (contentType === 'text/html') {
				editorArea.html(attachment && attachment.content);
				switchToViewMode();
			}
		},
		initToolbar = function () {
			var fonts = ['Serif', 'Sans', 'Arial', 'Arial Black', 'Courier',
				'Courier New', 'Comic Sans MS', 'Helvetica', 'Impact', 'Lucida Grande', 'Lucida Sans', 'Tahoma', 'Times',
				'Times New Roman', 'Verdana'],
				fontTarget = $('[data-role=editor-toolbar] [data-mm-role=font]');
			$.each(fonts, function (idx, fontName) {
				fontTarget.append($('<li><a data-edit="fontName ' + fontName + '" style="font-family:' + fontName + '">' + fontName + '</a></li>'));
			});
			$('[data-role=editor-toolbar] .dropdown-menu input')
				.click(function () {
					return false;
				})
				.change(function () {
					$(this).parent('.dropdown-menu').siblings('.dropdown-toggle').dropdown('toggle');
				})
				.keydown('esc', function () {
					this.value = ''; $(this).change();
				});
			$('[data-role=editor-toolbar] a')
				.attr('data-category', 'Attachment editor toolbar')
				.attr('data-event-type', function () {
					return $(this).attr('data-edit') || $(this).attr('title') || $(this).text() || 'unknown';
				});
		};
	if (isTouch) {
		editorArea.detach().prependTo(element);
	}
	initToolbar();
	editorArea.wysiwyg();
	element.addClass('mm-editable');
	element.find('[data-mm-role=save]').click(save);
	element.find('[data-mm-role=close]').click(close);
	element.find('[data-mm-role=clear]').click(clear);
	element.find('[data-mm-role=edit]').click(switchToEditMode);
	$(document).keydown('esc', function () {
		if (element.is(':visible')) {
			close();
		}
	}).keydown('ctrl+s meta+s', function (e) {
		if (e.altKey) {
			return;
		}
		if (element.is(':visible')) {
			e.preventDefault();
			save();
			close();
		}
	}).keydown('ctrl+return meta+return', function () {
		if (element.is(':visible')) {
			if (isEditing) {
				save();
			} else {
				switchToEditMode();
			}
		}
	});
	$(window).bind('orientationchange resize', sizeEditor);
	mapModel.addEventListener('attachmentOpened', open);
	return element;
};

/*global jQuery*/
jQuery.fn.autoSaveWidget = function (autoSave) {
	'use strict';
	var self = this,
		applyButton = self.find('[data-mm-role=apply]');
	autoSave.addEventListener('unsavedChangesAvailable', function () {
		self.modal('show');
	});
	self.on('shown', function () {
		applyButton.focus();
	});
	applyButton.click(function () {
		autoSave.applyUnsavedChanges();
		self.modal('hide');
	});
	self.find('[data-mm-role=discard]').click(function () {
		autoSave.discardUnsavedChanges();
		self.modal('hide');
	});
};

/*global MM, observable*/
MM.AutoSave = function (mapController, storage, alertDispatcher, mapModel, clipboardKey) {
	'use strict';
	var prefix = 'auto-save-',
		self = this,
		currentMapId,
		currentIdea,
		changeListener,
		resourceListener,
		events = [],
		warningId,
		checkForLocalChanges = function (mapId) {
			var value = storage.getItem(prefix + mapId);
			if (value) {
				self.dispatchEvent('unsavedChangesAvailable', mapId);
			}
		},
		pushEvent = function (eventObject, mapId) {
			var autoSaveKey = prefix + mapId,
					saveEvents = function () {
						try {
							storage.setItem(autoSaveKey, events);
							return true;
						} catch (e) {
							return false;
						}
					},
					showWarning = function () {
						if (warningId) {
							return;
						}
						warningId = alertDispatcher.show('Unable to back up unsaved changes!', 'Please save this map as soon as possible to avoid losing unsaved information.', 'warning');
					};
			events.push(eventObject);
			if (!saveEvents()) {

				if (storage.removeKeysWithPrefix(prefix) + storage.removeKeysWithPrefix(clipboardKey) === 0) {
					showWarning();
				} else if (!saveEvents()) {
					showWarning();
				}
			}
		},
		trackChanges = function (idea, mapId) {
			events = [];
			changeListener = function (command, params) {
				pushEvent({cmd: command, args: params}, mapId);
			};
			resourceListener = function (resourceBody, resourceId) {
				pushEvent({cmd: 'storeResource', args: [resourceBody, resourceId]}, mapId);
			};
			idea.addEventListener('changed', changeListener);
			idea.addEventListener('resourceStored', resourceListener);
		},
		clearWarning = function () {
			if (warningId) {
				alertDispatcher.hide(warningId);
			}
			warningId = undefined;
		},
		onTrackingChange = function (mapId, idea, properties) {
			if (changeListener && currentIdea) {
				currentIdea.removeEventListener('changed', changeListener);
				currentIdea.removeEventListener('resourceStored', resourceListener);
			}

			if (mapId && (!properties || !properties.autoSave)) {
				currentMapId = mapId;
				currentIdea = idea;
				clearWarning();
				checkForLocalChanges(mapId);
				trackChanges(idea, mapId);
			}
		};
	observable(this);
	clipboardKey = clipboardKey || 'clipboard';
	self.applyUnsavedChanges = function () {
		var events = storage.getItem(prefix + currentMapId);
		if (events) {
			mapModel.pause();
			events.forEach(function (event) {
				currentIdea.execCommand(event.cmd, event.args);
			});
			mapModel.resume();
		}
	};
	self.discardUnsavedChanges = function () {
		events = [];
		storage.remove(prefix + currentMapId);
	};
	mapController.addEventListener('mapSaved', function (mapId, idea) {
		clearWarning();
		if (mapId === currentMapId || idea === currentIdea) {
			self.discardUnsavedChanges();
		}
		if (mapId !== currentMapId) {
			onTrackingChange(mapId, idea);
		}
	});
	mapController.addEventListener('mapLoaded', onTrackingChange);
};



/*global _, observable, jQuery, MM*/
MM.Bookmark = function (mapController, storage, storageKey) {
	'use strict';
	var self = observable(this),
		currentMap = false,
		list = [],
		pushToStorage = function () {
			if (storage && storageKey) {
				storage.setItem(storageKey, list);
			}
		};
	if (storage && storageKey) {
		list = storage.getItem(storageKey) || [];
	}
	mapController.addEventListener('mapSaved', function (key, idea) {
		var couldPin = self.canPin();
		currentMap = {
			mapId: key,
			title: idea.title
		};
		self.store({
			mapId: key,
			title: idea.title
		});
		if (couldPin !== self.canPin()) {
			self.dispatchEvent('pinChanged');
		}
	});
	mapController.addEventListener('mapLoaded', function (key, idea) {
		var couldPin = self.canPin();
		currentMap = {
			mapId: key,
			title: idea.title
		};
		if (couldPin !== self.canPin()) {
			self.dispatchEvent('pinChanged');
		}
	});
	self.store = function (bookmark) {
		if (!(bookmark.mapId && bookmark.title)) {
			throw new Error('Invalid bookmark');
		}
		var existing = _.find(list, function (b) {
			return (b.title === bookmark.title) || (b.mapId === bookmark.mapId);
		});
		if (existing) {
			existing.mapId = bookmark.mapId;
			existing.title = bookmark.title;
		} else {
			list.push(_.clone(bookmark));
		}
		pushToStorage();
		self.dispatchEvent('added', bookmark);
	};
	self.remove = function (mapId, suppressAlert) {
		var idx, removed;
		suppressAlert = suppressAlert || false;
		for (idx = 0; idx < list.length; idx++) {
			if (list[idx].mapId === mapId) {
				removed = list.splice(idx, 1)[0];
				pushToStorage();
				self.dispatchEvent('deleted', removed, suppressAlert);
				return;
			}
		}
	};
	self.list = function () {
		return _.clone(list).reverse();
	};
	self.links = function (titleLimit) {
		titleLimit = titleLimit || 30;
		return _.map(self.list(), function (element) {
			return {
				title: element.title,
				shortTitle: element.title.length > titleLimit ? element.title.substr(0, titleLimit) + '...' : element.title,
				mapId: element.mapId
			};
		});
	};
	self.pin = function () {
		if (currentMap) {
			self.store(currentMap);
		}
	};
	self.canPin = function () {
		return currentMap && (list.length === 0 || _.every(list, function (bookmark) {
			return bookmark.mapId !== currentMap.mapId;
		}));
	};
};
jQuery.fn.bookmarkWidget = function (bookmarks, alert, mapController) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
			alertId,
			template = element.find('.template').detach(),
			pin = element.find('[data-mm-role=bookmark-pin]'),
			originalContent = element.children().filter('[data-mm-role=bookmark]').clone(),
			updateLinks = function () {
				var list = bookmarks.links(),
					link,
					children,
					addition;
				element.children().filter('[data-mm-role=bookmark]').remove();
				pin.parent().hide();
				if (bookmarks.canPin()) {
					pin.parent().show();
				}
				if (list.length) {
					list.slice(0, 10).forEach(function (bookmark) {
						addition = template.clone().show().attr('data-mm-role', 'bookmark').appendTo(element);
						link = addition.find('a');
						children = link.children().detach();
						link.click(function () {
							mapController.loadMap(bookmark.mapId);
						});
						link.text(bookmark.shortTitle).addClass('repo-' + bookmark.mapId[0]);
						children.appendTo(link);
						addition.find('[data-mm-role=bookmark-delete]').click(function () {
							bookmarks.remove(bookmark.mapId);
							element.parents('.dropdown').find('.dropdown-toggle').dropdown('toggle');
							return false;
						});
					});
				} else {
					element.append(originalContent.clone());
				}
			};
		pin.click(function () {
			bookmarks.pin();
		});
		bookmarks.addEventListener('added', updateLinks);
		bookmarks.addEventListener('pinChanged', updateLinks);
		bookmarks.addEventListener('deleted', function (mark, suppressAlert) {
			updateLinks();
			if (alert && !suppressAlert) {
				if (alertId) {
					alert.hide(alertId);
				}
				alertId = alert.show('Bookmark Removed.', mark.title + ' was removed from the list of your maps. <a href="#"> Undo </a> ', 'success');
				jQuery('.alert-no-' + alertId).find('a').click(function () {
					bookmarks.store(mark);
					alert.hide(alertId);
				});
			}
		});
		updateLinks();
	});
};

/* http://github.com/mindmup/bootstrap-wysiwyg */
/*global jQuery,  FileReader*/
/*jslint browser:true*/
jQuery(function ($) {
	'use strict';
	var readFileIntoDataUrl = function (fileInfo) {
		var loader = $.Deferred(),
			fReader = new FileReader();
		fReader.onload = function (e) {
			loader.resolve(e.target.result);
		};
		fReader.onerror = loader.reject;
		fReader.onprogress = loader.notify;
		fReader.readAsDataURL(fileInfo);
		return loader.promise();
	};
	$.fn.cleanHtml = function () {
		var html = $(this).html();
		return html && html.replace(/(<br>|\s|<div><br><\/div>|&nbsp;)*$/, '');
	};
	$.fn.wysiwyg = function (userOptions) {
		var editor = this,
			selectedRange,
			options,
			updateToolbar = function () {
				if (options.activeToolbarClass) {
					$(options.toolbarSelector).find('.btn[data-' + options.commandRole + ']').each(function () {
						var command = $(this).data(options.commandRole);
						if (document.queryCommandState(command)) {
							$(this).addClass(options.activeToolbarClass);
						} else {
							$(this).removeClass(options.activeToolbarClass);
						}
					});
				}
			},
			execCommand = function (commandWithArgs, valueArg) {
				var commandArr = commandWithArgs.split(' '),
					command = commandArr.shift(),
					args = commandArr.join(' ') + (valueArg || '');
				document.execCommand(command, 0, args);
				updateToolbar();
			},
			bindHotkeys = function (hotKeys) {
				$.each(hotKeys, function (hotkey, command) {
					editor.keydown(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
							execCommand(command);
						}
					}).keyup(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
						}
					});
				});
			},
			getCurrentRange = function () {
				var sel = window.getSelection();
				if (sel.getRangeAt && sel.rangeCount) {
					return sel.getRangeAt(0);
				}
			},
			saveSelection = function () {
				selectedRange = getCurrentRange();
			},
			restoreSelection = function () {
				var selection = window.getSelection(),
					textRange;
				if (selectedRange) {
					try {
						selection.removeAllRanges();
					} catch (ex) {
						textRange = document.body.createTextRange();
						textRange.select();
						document.selection.empty();
					}
					selection.addRange(selectedRange);
				}
			},
			insertFiles = function (files) {
				editor.focus();
				$.each(files, function (idx, fileInfo) {
					if (/^image\//.test(fileInfo.type)) {
						$.when(readFileIntoDataUrl(fileInfo)).done(function (dataUrl) {
							execCommand('insertimage', dataUrl);
						});
					}
				});
			},
			markSelection = function (input, color) {
				restoreSelection();
				document.execCommand('hiliteColor', 0, color || 'transparent');
				saveSelection();
				input.data(options.selectionMarker, color);
			},
			bindToolbar = function (toolbar, options) {
				toolbar.find('a[data-' + options.commandRole + ']').click(function () {
					restoreSelection();
					editor.focus();
					execCommand($(this).data(options.commandRole));
					saveSelection();
				});
				toolbar.find('[data-toggle=dropdown]').click(restoreSelection);
				toolbar.find('input[type=text][data-' + options.commandRole + ']').on('webkitspeechchange change', function () {
					var newValue = this.value; /* ugly but prevents fake double-calls due to selection restoration */
					this.value = '';
					restoreSelection();
					if (newValue) {
						editor.focus();
						execCommand($(this).data(options.commandRole), newValue);
					}
					saveSelection();
				}).on('focus', function () {
					var input = $(this);
					if (!input.data(options.selectionMarker)) {
						markSelection(input, options.selectionColor);
						input.focus();
					}
				}).on('blur', function () {
					var input = $(this);
					if (input.data(options.selectionMarker)) {
						markSelection(input, false);
					}
				});
				toolbar.find('input[type=file][data-' + options.commandRole + ']').change(function () {
					restoreSelection();
					if (this.type === 'file' && this.files && this.files.length > 0) {
						insertFiles(this.files);
					}
					saveSelection();
					this.value = '';
				});
			},
			initFileDrops = function () {
				editor.on('dragenter dragover', false)
					.on('drop', function (e) {
						var dataTransfer = e.originalEvent.dataTransfer;
						e.stopPropagation();
						e.preventDefault();
						if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
							insertFiles(dataTransfer.files);
						}
					});
			};
		options = $.extend({}, $.fn.wysiwyg.defaults, userOptions);
		bindHotkeys(options.hotKeys);
		initFileDrops();
		bindToolbar($(options.toolbarSelector), options);
		editor.attr('contenteditable', true)
			.on('mouseup keyup mouseout', function () {
				saveSelection();
				updateToolbar();
			});
		$(window).bind('touchend', function (e) {
			var isInside = (editor.is(e.target) || editor.has(e.target).length > 0),
				currentRange = getCurrentRange(),
				clear = currentRange && (currentRange.startContainer === currentRange.endContainer && currentRange.startOffset === currentRange.endOffset);
			if (!clear || isInside) {
				saveSelection();
				updateToolbar();
			}
		});
		return this;
	};
	$.fn.wysiwyg.defaults = {
		hotKeys: {
			'ctrl+b meta+b': 'bold',
			'ctrl+i meta+i': 'italic',
			'ctrl+u meta+u': 'underline',
			'ctrl+z meta+z': 'undo',
			'ctrl+y meta+y meta+shift+z': 'redo',
			'ctrl+l meta+l': 'justifyleft',
			'ctrl+r meta+r': 'justifyright',
			'ctrl+e meta+e': 'justifycenter',
			'ctrl+j meta+j': 'justifyfull',
			'shift+tab': 'outdent',
			'tab': 'indent'
		},
		toolbarSelector: '[data-role=editor-toolbar]',
		commandRole: 'edit',
		activeToolbarClass: 'btn-info',
		selectionMarker: 'edit-focus-marker',
		selectionColor: 'darkgrey'
	};
});

/*global window, jQuery*/
jQuery.fn.classCachingWidget = function (keyPrefix, store) {
	'use strict';
	var element = jQuery(this),
		key = keyPrefix + '-' + element.selector;
	jQuery(window).unload(function () {
		store[key] = element.attr('class');
	});
	element.addClass(store[key]);
	return this;
};

/*global MM, _, observable */
MM.CollaborationModel = function (mapModel) {
	'use strict';
	var self = observable(this),
			running = false,
			onSelectionChanged = function (id, isSelected) {
				if (running && isSelected) {
					self.dispatchEvent('myFocusChanged', id);
				}
			},
			onNodeChanged = function (updatedNode, contentSessionId) {
				if (!contentSessionId || !running) {
					return;
				}
				var collaboratorDidEdit = function (collaborator) {
					if (collaborator) {
						self.dispatchEvent('collaboratorDidEdit', collaborator, updatedNode);
					}
				};
				self.dispatchEvent('collaboratorRequestedForContentSession', contentSessionId, collaboratorDidEdit);
			};
	self.collaboratorFocusChanged = function (collaborator) {
		if (running) {
			self.dispatchEvent('collaboratorFocusChanged', collaborator);
		}
	};
	self.collaboratorPresenceChanged = function (collaborator, isOnline) {
		if (running) {
			var eventName = isOnline ? 'collaboratorJoined' : 'collaboratorLeft';
			self.dispatchEvent(eventName, collaborator, isOnline);
		}
	};
	self.start = function (collaborators) {
		running = true;
		if (_.size(collaborators) > 0) {
			_.each(collaborators, self.collaboratorFocusChanged);
		}
	};
	self.showCollaborator = function (collaborator) {
		self.dispatchEvent('sessionFocusRequested', collaborator.sessionId, mapModel.centerOnNode);
	};
	self.stop = function () {
		self.dispatchEvent('stopped');
		running = false;
	};
	mapModel.addEventListener('nodeSelectionChanged', onSelectionChanged);
	mapModel.addEventListener('nodeTitleChanged', onNodeChanged);
};

/*global jQuery */
jQuery.fn.collaboratorListWidget = function (collaborationModel, markerClass) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this),
				list = element.find('[data-mm-role~=collab-list]'),
				template = list.find('[data-mm-role~=template]').detach(),
				itemForSession = function (sessionId) {
					return list.find('[mm-session-id=' + sessionId + ']');
				},
				addCollaborator = function (collaborator) {
					if (itemForSession(collaborator.sessionId).size() > 0) {
						return;
					}
					var newItem = template.clone().appendTo(list).attr('mm-session-id', collaborator.sessionId);
					newItem.find('[data-mm-role~=collaborator-name]').text(collaborator.name);
					newItem.find('[data-mm-role~=collaborator-photo]').attr('src', collaborator.photoUrl).css('border-color', collaborator.color);
					newItem.find('[data-mm-role~="collaborator-selector"]').on('click tap', function () {
						collaborationModel.showCollaborator(collaborator);
					});
					element.addClass(markerClass);
				},
				removeCollaborator = function (collaborator) {
					itemForSession(collaborator.sessionId).remove();
					if (list.children().size() === 0) {
						element.removeClass(markerClass);
					}
				};
		element.removeClass(markerClass);
		collaborationModel.addEventListener('collaboratorFocusChanged collaboratorJoined', addCollaborator);
		collaborationModel.addEventListener('collaboratorLeft', removeCollaborator);
		collaborationModel.addEventListener('stopped', function () {
			element.removeClass(markerClass);
			list.empty();
		});
	});
};

/*global jQuery, MM, Image*/
MM.deferredImageLoader = function (url) {
	'use strict';
	var result = jQuery.Deferred(),
			domImg = new Image();
	domImg.onload = function loadImage() {
		result.resolve(jQuery(domImg));
	};
	domImg.src = url;
	return result.promise();
};
jQuery.fn.collaboratorPhotoWidget = function (collaborationModel, imageLoader, imgClass) {
	'use strict';
	var self = jQuery(this),
			showPictureInNode = function (nodeId, jQueryImg) {
				var node = self.nodeWithId(nodeId);
				if (node && node.length > 0) {
					jQueryImg.appendTo(node).css({
						bottom: -1 * Math.round(jQueryImg.height() / 2),
						right: -1 * Math.round(jQueryImg.width() / 2)
					});
				}
			},
			imageForCollaborator = function (sessionId) {
				return self.find('.' + imgClass + '[data-mm-collaborator-id=' + sessionId + ']');
			},
			showPictureForCollaborator = function (collaborator) {
				var cached = imageForCollaborator(collaborator.sessionId);
				if (cached && cached.length > 0) {
					showPictureInNode(collaborator.focusNodeId, cached);
				} else {
					imageLoader(collaborator.photoUrl).then(function (jQueryImg) {
						if (imageForCollaborator(collaborator.sessionId).length === 0) {
							jQueryImg
								.addClass(imgClass).attr('data-mm-collaborator-id', collaborator.sessionId)
								.css('border-color', collaborator.color)
								.tooltip({title: collaborator.name, placement:'bottom', container: 'body'});
							showPictureInNode(collaborator.focusNodeId, jQueryImg);
						}
					});
				}
			},
			removePictureForCollaborator = function (collaborator) {
				imageForCollaborator(collaborator.sessionId).remove();
			};
	collaborationModel.addEventListener('stopped', function () {
		self.find('.' + imgClass).remove();
	});
	collaborationModel.addEventListener('collaboratorFocusChanged collaboratorJoined', showPictureForCollaborator);
	collaborationModel.addEventListener('collaboratorLeft', removePictureForCollaborator);

	return self;
};

/*global jQuery, setTimeout, _ */
jQuery.fn.collaboratorSpeechBubbleWidget = function (collaborationModel, timeoutArg) {
	'use strict';
	var timeout = timeoutArg || 3000;
	return this.each(function () {
		var element = jQuery(this),
			currentCollaborator,
			showCollaborator = function () {
				collaborationModel.showCollaborator(currentCollaborator);
			},
			img = element.find('[data-mm-role=collaborator-photo]'),
			contentTemplate = element.find('[data-mm-role=popover-content-template]').detach(),
			titleTemplate = element.find('[data-mm-role=popover-title-template]').detach(),
			popoverContent = function (message, style) {
				var template = contentTemplate.clone();
				template.find('[data-mm-role=popover-content]').text(message);
				if (style) {
					template.find('[data-mm-role=popover-content]').addClass(style);
				}
				return template.html();
			},
			popoverTitle = function (nodeTitle) {
				titleTemplate.find('[data-mm-role=popover-title]').text(nodeTitle);
				return titleTemplate.html();
			},
			showSpeechBubble = _.throttle(function (collaborator, message, style) {
					currentCollaborator = collaborator;
					img.popover('destroy');
					img.attr('src', collaborator.photoUrl);
					img.css('border-color', collaborator.color);
					img.popover({
						title: popoverTitle(collaborator.name),
						content: popoverContent(message, style),
						placement: 'right',
						trigger: 'manual',
						animation: true,
						html: true
					});
					element.fadeIn(200, function () {
						setTimeout(function () {
							img.popover('destroy');
							element.fadeOut();
						}, timeout);
					});
					img.popover('show');
				}, timeout + 700, {trailing: false}),
			onEdit = function (collaborator, node) {
				var trimmedTitle = node && node.title && node.title.trim(),
						style = trimmedTitle ? '' : 'muted',
						nodeTitle = trimmedTitle || 'removed node content';
				showSpeechBubble(collaborator, nodeTitle, style);
			},
			onJoin = function (collaborator) {
				showSpeechBubble(collaborator, 'joined the session', 'muted');
			},
			onLeave = function (collaborator) {
				showSpeechBubble(collaborator, 'left the session', 'muted');
			};
		img.on('click tap', showCollaborator);
		collaborationModel.addEventListener('collaboratorDidEdit', onEdit);
		collaborationModel.addEventListener('collaboratorJoined', onJoin);
		collaborationModel.addEventListener('collaboratorLeft', onLeave);
	});
};


/*global $, Color*/

$.fn.commandLineWidget = function (keyBinding, mapModel) {
	'use strict';
	var element = this;
	element.keydown(keyBinding, function (event) {
		if (!mapModel.getInputEnabled()) {
			return;
		}
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}
	});
	element.keyup(keyBinding, function (event) {
		if (!mapModel.getInputEnabled()) {
			return;
		}
		var input,
			validColor = function (value) {
				/*jslint newcap:true*/
				var color = value && Color(value.toLowerCase()),
					valid = color &&
						(color.hexString().toUpperCase() === value.toUpperCase() ||
						(color.keyword() && (color.keyword().toUpperCase() !== 'BLACK' || value.toUpperCase() === 'BLACK')));
				if (valid) {
					return color;
				}
				if (value && value[0] !== '#') {
					return validColor('#' + value);
				}
				return false;
			},
			hide = function () {
				if (input) {
					input.remove();
				}
				mapModel.setInputEnabled(true);
			},
			commit = function () {
				var value = input && input.val(),
					color = validColor(value.toLowerCase());
				hide();
				if (color) {
					mapModel.updateStyle('cmdline', 'background', color.hexString());
				}
			},
			colors = [
				'aliceblue',
				'antiquewhite',
				'aqua',
				'aquamarine',
				'azure',
				'beige',
				'bisque',
				'black',
				'blanchedalmond',
				'blue',
				'blueviolet',
				'brown',
				'burlywood',
				'cadetblue',
				'chartreuse',
				'chocolate',
				'coral',
				'cornflowerblue',
				'cornsilk',
				'crimson',
				'cyan',
				'darkblue',
				'darkcyan',
				'darkgoldenrod',
				'darkgrey',
				'darkgreen',
				'darkkhaki',
				'darkmagenta',
				'darkolivegreen',
				'darkorange',
				'darkorchid',
				'darkred',
				'darksalmon',
				'darkseagreen',
				'darkslateblue',
				'darkslategrey',
				'darkturquoise',
				'darkviolet',
				'deeppink',
				'deepskyblue',
				'dimgrey',
				'dodgerblue',
				'firebrick',
				'floralwhite',
				'forestgreen',
				'fuchsia',
				'gainsboro',
				'ghostwhite',
				'gold',
				'goldenrod',
				'grey',
				'green',
				'greenyellow',
				'honeydew',
				'hotpink',
				'indianred',
				'indigo',
				'ivory',
				'khaki',
				'lavender',
				'lavenderblush',
				'lawngreen',
				'lemonchiffon',
				'lightblue',
				'lightcoral',
				'lightcyan',
				'lightgoldenrodyellow',
				'lightgrey',            // IE6 breaks on this color
				'lightgreen',
				'lightpink',
				'lightsalmon',
				'lightseagreen',
				'lightskyblue',
				'lightslategrey',
				'lightsteelblue',
				'lightyellow',
				'lime',
				'limegreen',
				'linen',
				'magenta',
				'maroon',
				'mediumaquamarine',
				'mediumblue',
				'mediumorchid',
				'mediumpurple',
				'mediumseagreen',
				'mediumslateblue',
				'mediumspringgreen',
				'mediumturquoise',
				'mediumvioletred',
				'midnightblue',
				'mintcream',
				'mistyrose',
				'moccasin',
				'navajowhite',
				'navy',
				'oldlace',
				'olive',
				'olivedrab',
				'orange',
				'orangered',
				'orchid',
				'palegoldenrod',
				'palegreen',
				'paleturquoise',
				'palevioletred',
				'papayawhip',
				'peachpuff',
				'peru',
				'pink',
				'plum',
				'powderblue',
				'purple',
				'red',
				'rosybrown',
				'royalblue',
				'saddlebrown',
				'salmon',
				'sandybrown',
				'seagreen',
				'seashell',
				'sienna',
				'silver',
				'skyblue',
				'slateblue',
				'slategrey',
				'snow',
				'springgreen',
				'steelblue',
				'tan',
				'teal',
				'thistle',
				'tomato',
				'turquoise',
				'violet',
				'wheat',
				'white',
				'whitesmoke',
				'yellow',
				'yellowgreen'
			];
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}
		mapModel.setInputEnabled(false);
		input  = $('<input type="text" placeholder="Type a color name or hex…">')
			.css('position', 'absolute')
			.css('z-index', '9999')
			.appendTo(element)
			.css('top', '30%')
			.css('left', '40%')
			.css('width', '20%')
			.css('border-width', '5px')
			.focus()
			.blur(hide)
			.keyup('Esc', hide)
			.change(commit)
			.typeahead({
				source: colors,
				highlighter: function (item) {
					return '<span style="background-color:' + item + ';" >&nbsp;</span>&nbsp;' + item;
				}
			});
	});
	return element;
};

/*global jQuery, _, document, window*/
jQuery.fn.contextMenuWidget = function (mapModel) {
	'use strict';
	var content = this.find('[data-mm-context-menu]').clone(),
		element = jQuery('<ul class="dropdown-menu">').css('position', 'absolute').css('z-index', '999').hide().appendTo('body'),
		hide = function () {
			if (element.is(':visible')) {
				element.hide();
			}
			jQuery(document).off('click touch keydown', hide);
		},
		topMenus = { },
		getTopMenu = function (label) {
			if (!topMenus[label]) {
				var dropDownMenu = jQuery('<li class="dropdown-submenu"><a tabindex="-1" href="#"></a><ul class="dropdown-menu"></ul></li>').appendTo(element);
				dropDownMenu.find('a').text(label);
				topMenus[label] = dropDownMenu.find('ul');
			}
			return topMenus[label];
		};
	content.find('a').attr('data-category', 'Context Menu');
	_.each(content, function (menuItem) {
		var submenu = jQuery(menuItem).attr('data-mm-context-menu');

		if (submenu) {
			getTopMenu(submenu).append(menuItem);
		} else {
			element.append(menuItem);
		}
	});
	mapModel.addEventListener('mapMoveRequested mapScaleChanged nodeSelectionChanged nodeEditRequested mapViewResetRequested', hide);
	mapModel.addEventListener('contextMenuRequested', function (nodeId, x, y) {
		element.css('left', x).css('top', y - 10).css('display', 'block').show();
		if (element.offset().top + element.outerHeight() > jQuery(window).height() - 20) {
			element.css('top', jQuery(window).height() - 20 - element.outerHeight());
		}
		if (element.offset().left + (2 * element.outerWidth()) > jQuery(window).width() - 20) {
			element.find('.dropdown-submenu').addClass('pull-left');
		} else {
			element.find('.dropdown-submenu').removeClass('pull-left');
		}
		if (element.offset().left + (element.outerWidth()) > jQuery(window).width() - 20) {
			element.css('left', jQuery(window).width() - 20 - (element.outerWidth()));
		}
		jQuery(document).off('click', hide);
		element.on('mouseenter', function () {
			jQuery(document).off('click', hide);
		});
		element.on('mouseout', function () {
			jQuery(document).on('click', hide);
		});
		jQuery(document).on('touch keydown', hide);
	});
	element.on('contextmenu', function (e) {
		e.preventDefault(); e.stopPropagation(); return false;
	});
	return element;
};

/* global jQuery, MM*/
MM.CustomStyleController = function (activeContentListener, mapModel) {
	'use strict';
	var self = this,
		customStyleElement = jQuery('<style id="customStyleCSS" type="text/css"></style>').appendTo('body'),
		currentStyleText,
		publishData = function (activeContent) {
			var newText = activeContent.getAttr('customCSS');
			if (newText !== currentStyleText) {
				currentStyleText = newText;
				customStyleElement.text(currentStyleText || '');
				jQuery('.mapjs-node').data('nodeCacheMark', '');
				mapModel.rebuildRequired();
			}
		};
	self.getStyle = function () {
		return currentStyleText || '';
	};
	self.setStyle = function (styleText) {
		var activeContent = activeContentListener.getActiveContent();
		activeContent.updateAttr(activeContent.id, 'customCSS', styleText);
	};
	activeContentListener.addListener(publishData);
};
jQuery.fn.customStyleWidget = function (controller) {
	'use strict';
	var modal = this,
		textField = modal.find('[data-mm-role=style-input]'),
		confirmButton = modal.find('[data-mm-role=save]');
	modal.on('show', function () {
		textField.val(controller.getStyle());
	});
	confirmButton.click(function () {
		controller.setStyle(textField.val());
	});
};


/* global MM, jQuery*/
MM.EmbeddedMapUrlGenerator = function (config) {
	'use strict';
	var self = this;
	self.buildMapUrl = function (mapId) {
		var prefix = mapId && mapId[0],
			prefixConfig = prefix && config[prefix],
			deferred = jQuery.Deferred();
		if (prefixConfig) {
			deferred.resolve((prefixConfig.prefix || '') +  mapId.slice(prefixConfig.remove) + (prefixConfig.postfix || ''));
		} else {
			deferred.reject();
		}
		return deferred.promise();
	};
};

/*global jQuery, MM, _, location, window, document */
MM.Extensions = function (storage, storageKey, config, components) {
	'use strict';
	var active = [],
		loadScriptsAsynchronously = function (d, s, urls, callback, errorcallback) {
			urls.forEach(function (url) {
				var js, fjs = d.getElementsByTagName(s)[0];
				js = d.createElement(s);
				js.src = (document.location.protocol === 'file:' ? 'http:' : '') + url;
				js.onload = callback;
				js.onerror = errorcallback;
				fjs.parentNode.insertBefore(js, fjs);
			});
		},
		getScriptsForExtensions = function (extensionNameArray) {
			return _.flatten(_.reject(_.map(extensionNameArray, function (ext) {
				return MM.Extensions.config[ext] && MM.Extensions.config[ext].script.split(' ');
			}), function (e) {
				return !e;
			}));
		};
	if (storage[storageKey]) {
		active = storage[storageKey].split(' ');
	}
	this.requiredExtension = function (mapId) {
		var key, ext;
		/*jslint forin:true*/
		for (key in MM.Extensions.config) {
			ext = MM.Extensions.config[key];
			if (ext.providesMapId && ext.providesMapId(mapId)) {
				return key;
			}
		}
	};
	this.scriptsToLoad = function (optionalMapId) {
		var optional = this.requiredExtension(optionalMapId),
			loading = optional ? _.union(active, optional) : active,
			scriptArray = getScriptsForExtensions(loading);
		return _.map(scriptArray, function (script) {
			if ((/^http[s]?:/).test(script)) {
				return script;
			} return config.publicUrl + script;
		});
	};
	this.isActive = function (ext) {
		return _.contains(active, ext);
	};
	this.setActive = function (ext, shouldActivate) {
		if (shouldActivate) {
			active = _.union(active, [ext]);
		} else {
			active = _.without(active, ext);
		}
		storage[storageKey] = active.join(' ');
		if (components && components.activityLog) {
			components.activityLog.log('Extensions', ext, 'act-' + shouldActivate);
		}
	};
	this.load = function (optionalMapId) {
		var deferred = jQuery.Deferred(),
			scripts = this.scriptsToLoad(optionalMapId),
			alertId,
			intervalId;
		MM.Extensions.components = components;
		MM.Extensions.mmConfig = config;
		loadScriptsAsynchronously(document, 'script', config.scriptsToLoadAsynchronously.split(' '));
		MM.Extensions.pendingScripts = _.invert(scripts);
		loadScriptsAsynchronously(document, 'script', scripts, function () {
			delete MM.Extensions.pendingScripts[jQuery(this).attr('src')];
		}, function () {
			components.alert.hide(alertId);
			window.clearInterval(intervalId);
			components.alert.show('A required extension failed to load due to a network error.', 'You may continue to use the site but some features may not be available. Please reload the page when you reconnect to the Internet to activate all the features. If the error persists, please contact us at <a href="mailto:contact@mindmup.com">contact@mindmup.com</a>', 'error');
			deferred.resolve();
		});

		if (!_.isEmpty(MM.Extensions.pendingScripts)) {
			alertId = components.alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Please wait, loading extensions...<span data-mm-role="num-extensions"></span>');
			intervalId = window.setInterval(function () {
				if (_.isEmpty(MM.Extensions.pendingScripts)) {
					components.alert.hide(alertId);
					window.clearInterval(intervalId);
					deferred.resolve();
				} else {
					jQuery('[data-mm-role=num-extensions]').text(_.size(MM.Extensions.pendingScripts) + ' remaining');
				}
			}, 1000);
		} else {
			deferred.resolve();
		}
		return deferred.promise();
	};
};
MM.Extensions.config = {
	'goggle-collaboration' : {
		name: 'Realtime collaboration',
		script: '/e/google-collaboration.js',
		icon: 'icon-group',
		doc: 'http://blog.mindmup.com/p/realtime-collaboration.html',
		desc: 'Realtime collaboration on a map, where several people can concurrently change it and updates are shown to everyone almost instantly. Collaboration is persisted using Google Drive.',
		providesMapId: function (mapId) {
			'use strict';
			return (/^cg/).test(mapId);
		}
	},
	'progress' : {
		name: 'Progress',
		script: '/e/progress.js',
		icon: 'icon-dashboard',
		doc: 'http://blog.mindmup.com/p/monitoring-progress.html',
		desc: 'Progress allows you to manage hierarchies of tasks faster by propagating statuses to parent nodes. For example, when all sub-tasks are completed, the parent task is marked as completed automatically.',
		aggregateAttributeName: 'progress-statuses',
		measurementsConfigName: 'measurements-config',
		isActiveOnMapContent: function (content) {
			'use strict';
			return content.getAttr(MM.Extensions.config.progress.aggregateAttributeName);
		}
	},
	'straight-lines' : {
		name: 'Straight lines',
		script: '/e/straight-lines.js',
		icon: 'icon-reorder',
		doc: 'http://blog.mindmup.com/p/straight-lines.html',
		desc: 'This extension converts funky curve connectors into straight lines, which makes it clearer to see what connects to what on large maps'
	},
	'github' : {
		name: 'Github',
		script: '/e/github.js',
		icon: 'icon-github',
		doc: 'http://www.github.com',
		desc: 'Store your maps on Github',
		providesMapId: function (mapId) {
			'use strict';
			return (/^h/).test(mapId);
		}
	},
	'dropbox' : {
		name: 'Dropbox',
		script: 'https://www.dropbox.com/static/api/1/dropbox-datastores-0.1.0-b3.js /e/dropbox.js',
		icon: 'icon-dropbox',
		doc: 'http://blog.mindmup.com/p/working-with-dropbox.html',
		desc: 'Store your maps on Dropbox',
		providesMapId: function (mapId) {
			'use strict';
			return (/^d1/).test(mapId);
		}
	}
};
jQuery.fn.extensionsWidget = function (extensions, mapController, alert) {
	'use strict';
	var element = this,
		alertId,
		showAlertWithCallBack = function (message, prompt, type, callback) {
			alertId = alert.show(
				message,
				'<a href="#" data-mm-role="alert-callback">' + prompt + '</a>',
				type
			);
			jQuery('[data-mm-role=alert-callback]').click(function () {
				alert.hide(alertId);
				callback();
			});
		},
		listElement = element.find('[data-mm-role=ext-list]'),
		template = listElement.find('[data-mm-role=template]').hide().clone(),
		changed = false,
		causedByMapId;
	_.each(MM.Extensions.config, function (ext, extkey) {
		var item = template.clone().appendTo(listElement).show();
		item.find('[data-mm-role=title]').html('&nbsp;' + ext.name).addClass(ext.icon);
		item.find('[data-mm-role=doc]').attr('href', ext.doc);
		item.find('[data-mm-role=desc]').prepend(ext.desc);
		item.find('input[type=checkbox]').attr('checked', extensions.isActive(extkey)).change(function () {
			extensions.setActive(extkey, this.checked);
			changed = true;
		});
	});
	element.on('hidden', function () {
		if (changed) {
			if (!causedByMapId) {
				location.reload();
			} else {
				window.location = '/map/' + causedByMapId;
			}
		}
		causedByMapId = undefined;
	});

	mapController.addEventListener('mapIdNotRecognised', function (newMapId) {
		var required = extensions.requiredExtension(newMapId);
		alert.hide(alertId);
		if (newMapId && newMapId[0] === 'o') { /* ignore former offline map URLs */
			return;
		}
		if (required) {
			showAlertWithCallBack(
				'This map requires an extension to load!',
				'Click here to enable the ' +  MM.Extensions.config[required].name + ' extension',
				'warning',
				function () {
					causedByMapId = newMapId;
					element.modal('show');
				}
			);
		} else {
			alertId = alert.show('The URL is unrecognised!', 'it might depend on a custom extension that is not available to you.', 'error');
		}

	});
	mapController.addEventListener('mapLoaded', function (mapId, mapContent) {
		var requiredExtensions = _.filter(MM.Extensions.config, function (ext, id) {
				return ext.isActiveOnMapContent && ext.isActiveOnMapContent(mapContent) && !extensions.isActive(id);
			}),
			plural = requiredExtensions.length > 1 ? 's' : '';
		alert.hide(alertId);
		if (requiredExtensions.length) {
			showAlertWithCallBack(
				'This map uses additional extensions!',
				'Click here to enable the ' +  _.map(requiredExtensions, function (ext) {
					return ext.name;
				}).join(', ') + ' extension' + plural,
				'warning',
				function () {
					causedByMapId = mapId;
					element.modal('show');
				}
			);
		}
	});
	return element;
};



/*global $, FileReader, _, window, console */
$.fn.file_reader_upload = function (start, complete, fail, formats) {
	'use strict';
	var element = this,
		oFReader = window.FileReader && new FileReader(),
		fileName,
		fileType;
	formats = formats || ['mup', 'mm'];
	if (!oFReader) {
		return element;
	}
	start = start || function (name) {
		console.log('Reading', name);
	};
	complete = complete || function (content) {
		console.log('Read', content);
	};
	fail = fail || function (error) {
		console.log('Read error', error);
	};
	oFReader.onload = function (oFREvent) {
		complete(oFREvent.target.result, fileType);
	};
	oFReader.onerror = function (oFREvent) {
		fail('Error reading file', oFREvent);
	};
	oFReader.onloadstart = function () {
		start(fileName);
	};
	element.change(function () {
		var fileInfo = this.files[0];
		fileName = fileInfo.name;
		fileType = fileName.split('.').pop();
		if (!_.contains(formats, fileType)) {
			fail('unsupported format ' + fileType);
			return;
		}
		oFReader.readAsText(fileInfo, 'UTF-8');
		element.val('');
	});
	return element;
};

/*global MM, MAPJS, jQuery*/
MM.FileSystemMapSource = function FileSystemMapSource(fileSystem, postProcessCallback) {
	'use strict';
	var self = this,
		jsonMimeType = 'application/json',
		stringToContent = function (fileContent, mimeType) {
			var json, result;
			if (mimeType === jsonMimeType) {
				json = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
			} else if (mimeType === 'application/octet-stream') {
				json = JSON.parse(fileContent);
			} else if (mimeType === 'application/x-freemind' || mimeType === 'application/vnd-freemind') {
				json = MM.freemindImport(fileContent);
			}
			result = MAPJS.content(json);
			if (postProcessCallback) {
				postProcessCallback(result);
			}
			return result;
		},
		guessMimeType = function (fileName) {
			if (/\.mm$/.test(fileName)) {
				return 'application/x-freemind';
			}
			if (/\.mup$/.test(fileName)) {
				return 'application/json';
			}
			return 'application/octet-stream';
		};
	self.loadMap = function loadMap(mapId, showAuth) {
		var deferred = jQuery.Deferred(),
			editable = { 'application/json': true, 'application/octet-stream': true, 'application/x-freemind': false, 'application/vnd-freemind': false };
		fileSystem.loadMap(mapId, showAuth).then(
			function fileLoaded(stringContent, fileId, mimeType, properties, optionalFileName) {
				if (!mimeType && optionalFileName) {
					mimeType = guessMimeType(optionalFileName);
				}
				properties = jQuery.extend({editable: editable[mimeType]}, properties);
				if (mimeType === 'application/vnd.mindmup.collab') {
					return deferred.reject('map-load-redirect', 'c' + fileId).promise();
				}
				if (editable[mimeType] === undefined) {
					deferred.reject('format-error', 'Unsupported format ' + mimeType);
				} else {
					try {
						deferred.resolve(stringToContent(stringContent, mimeType), fileId, properties);
					} catch (e) {
						deferred.reject('format-error', 'File content not in correct format for this file type');
					}
				}
			},
			deferred.reject,
			deferred.notify
		);
		return deferred.promise();
	};
	self.saveMap = function (map, mapId, showAuth) {
		var cleanUp = function (str) {
				if (str) {
					return str.replace(/\/|\t|\n|\r/g, ' ');
				}
			},
			deferred = jQuery.Deferred(),
			contentToSave = JSON.stringify(map, null, 2),
			fileName = MM.navigationEscape(cleanUp(map.title)) + '.mup';
		fileSystem.saveMap(contentToSave, mapId, fileName, !!showAuth).then(deferred.resolve, deferred.reject, deferred.notify);
		return deferred.promise();
	};
	self.description = fileSystem.description;
	self.recognises = fileSystem.recognises;
};

/*global jQuery*/
jQuery.fn.floatingToolbarWidget = function () {
	'use strict';
	return this.each(function () {
		var element = jQuery(this);
		element.draggable({containment: 'window'});
	});
};

/*global MM, $, _, escape*/
MM.freemindImport = function (xml, start, progress) {
	'use strict';
	var nodeStyle = function (node, parentStyle) {
			var style = {}, attachment, toStr = function (xmlObj) {
				return $('<div>').append(xmlObj).html();
			};
			if (node.attr('BACKGROUND_COLOR')) {
				style.style = {background : node.attr('BACKGROUND_COLOR')};
			}
			if ((parentStyle && parentStyle.collapsed) || node.attr('FOLDED') === 'true') {
				style.collapsed = 'true';
			}
			attachment = node.children('richcontent').find('body');
			if (attachment.length > 0) {
				style.attachment = { contentType: 'text/html', content: toStr(attachment.children()) };
			}
			return style;
		},
		result,
		xmlToJson = function (xmlNode, parentStyle) {
			var node = $(xmlNode),
				result = {'title' : node.attr('TEXT') || ''},
				childNodes = node.children('node'),
				style = nodeStyle(node, parentStyle),
				children = _.map(childNodes, function (child) {
					return xmlToJson(child, style);
				}),
				childObj = {},
				index = 1;
			if (_.size(style) > 0) {
				result.attr = style;
			}
			if (children.length > 0) {
				_.each(children, function (child) {
					var position = $(childNodes[index - 1]).attr('POSITION') === 'left' ? -1 : 1;
					childObj[position * index] = child;
					index += 1;
				});
				result.ideas = childObj;
			} else if (result.attr && result.attr.collapsed) {
				delete result.attr.collapsed;
			}
			if (progress) {
				progress();
			}
			return result;
		},
		xmlDoc = $($.parseXML(xml));
	if (start) {
		start(xmlDoc.find('node').length);
	}
	result = xmlToJson(xmlDoc.find('map').children('node').first());
	result.formatVersion = 2;
	return result;
};

/*jslint nomen: true*/
MM.freemindExport = function (idea) {
	'use strict';
	var formatNode = function (idea) {
		var escapedText = escape(idea.title).replace(/%([0-9A-F][0-9A-F])/g, '&#x$1;').replace(/%u([0-9A-F][0-9A-F][0-9A-F][0-9A-F])/g, '&#x$1;');
		return '<node ID="' + idea.id + '" TEXT="' + escapedText + '">' + (_.size(idea.ideas) > 0 ? _.map(_.sortBy(idea.ideas, function (val, key) {
			return parseFloat(key);
		}), formatNode).join('') : '') + '</node>';
	};
	return '<map version="0.7.1">' + formatNode(idea) + '</map>';
};

/* global MM, jQuery, FormData, _ */
/**
 * MM Gold API wrapper. This class is a JavaScript interface to the remote HTTP Gold server API,
 * and provides low-level methods for authentication and generating security tokens.
 * It implements the _configurationGenerator_ interface required by the {{#crossLink "LayoutExportController"}}{{/crossLink}}
 * so it can be used directly to construct an export workflow class.
 *
 * ## Access licenses
 *
 * MindMup Gold requires a valid license for most file operations. The license is effectively a secret key
 * identifying the user, and granting access to the server resources for storage and export. The license
 * is used for billing purposes to associate the resource usage with an active Gold subscription.
 *
 * There are two ways to allow users to access the service:
 *
 * 1. Allow your users to log in with their individual Gold accounts, effectively using their subscriptions
 * 2. Use a single license for all the users
 *
 * For the first scenario, each user session should go through the Authentication Workflow described below. For
 * the second scenario, it is better to execute the authentication once manually, and store the license
 * key securely on a server. The license key never expires and should be kept secret.
 *
 * To make this class more useful, the actual storage and management of the license is abstracted into a separate
 * interface, so third party implementers can provide their own storage mechanism. See
 * the {{#crossLink "GoldLicenseManager"}}{{/crossLink}} for more information.
 *
 * ## Authentication workflow
 *
 * MindMup Gold does not use passwords - instead, the authentication workflow
 * is similar to the typical password reset scenario - a one-time
 * authentication token can be requested from the server, and the token is sent
 * to the e-mail associated with the account. This token can then be used to
 * retrieve the Gold license key (in effect, logging in). See
 * {{#crossLink "GoldApi/requestCode:method"}}{{/crossLink}} and
 * {{#crossLink "GoldApi/restoreLicenseWithCode:method"}}{{/crossLink}}
 * for more information.
 *
 * For extra security, the internal HTTP API requires the sender to provide a
 * token known only to the requester while asking for a code, and supply the
 * same token again when retrieving the license. This effectively protects
 * against the e-mail being intercepted. A third party reading e-mails with
 * access codes will not be able to use them, because they don't know the
 * client token. The JavaScript API hides this complexity and automatically
 * generates a random string to send. This limits the execution of the two
 * calls to a single instance of GoldApi, as the current string is stored in
 * memory.
 *
 * The one-time codes sent by mail have to be used within a 10 minute time span
 * to retrieve a license, and only one such code can be active at any given
 * time. Requesting a new code effectively cancels the previous one.  (The
 * license string itself never expires automatically, and can be cached
 * locally).
 *
 * @class GoldApi
 * @constructor
 * @param {GoldLicenseManager} goldLicenseManager an object implementing the GoldLicenseManager API
 * @param {String} goldApiUrl the end-point for the HTTP API
 * @param {ActivityLog} activityLog activity log instance for logging purposes
 * @param {String} goldBucketName the S3 bucket name for public and anonymous files
 */
MM.GoldApi = function (goldLicenseManager, goldApiUrl, activityLog, goldBucketName) {
	'use strict';
	var self = this,
		currentOnetimePassword,
		currentIdentifier,
		LOG_CATEGORY = 'GoldApi',
		apiError = function (serverResult) {
			var recognisedErrors = ['not-authenticated', 'invalid-args', 'server-error', 'user-exists', 'email-exists'];
			if (_.contains(recognisedErrors, serverResult)) {
				return serverResult;
			}
			if (serverResult && serverResult.indexOf('not-connected ') === 0) {
				return serverResult;
			}
			return 'network-error';
		},
		licenseExec = function (apiProc, showLicenseDialog, args, expectedAccount) {
			var deferred = jQuery.Deferred(),
				onLicenceRetrieved = function (license) {
					var execArgs = _.extend({}, args, {'license': JSON.stringify(license)});
					if (expectedAccount && expectedAccount !== license.account) {
						deferred.reject('not-authenticated');
					} else {
						self.exec(apiProc, execArgs).then(
							function (httpResult) {
								deferred.resolve(httpResult, license.account);
							},
							deferred.reject);
					}
				};
			goldLicenseManager.retrieveLicense(showLicenseDialog).then(onLicenceRetrieved, deferred.reject);
			return deferred.promise();
		};
	self.exec = function (apiProc, args) {
		var deferred = jQuery.Deferred(),
			rejectWithError = function (jxhr) {
				var result = jxhr.responseText;
				activityLog.log(LOG_CATEGORY, 'error', apiProc + ':' + result);
				deferred.reject(apiError(result));
			},
			timer  = activityLog.timer(LOG_CATEGORY, apiProc),
			formData = new FormData(),
			dataTypes = {
				'license/register': 'json',
				'file/export_config': 'json',
				'file/upload_config': 'json',
				'file/echo_config': 'json',
				'license/subscription': 'json',
				'license/request_license_using_code': 'json',
				'license/request_license_using_google': 'json'
			};
		formData.append('api_version', '3');
		if (args) {
			_.each(args, function (value, key) {
				formData.append(key, value);
			});
		}
		jQuery.ajax({
			url: goldApiUrl + '/' + apiProc,
			dataType: dataTypes[apiProc],
			data: formData,
			processData: false,
			contentType: false,
			type: 'POST'
		}).then(deferred.resolve, rejectWithError).always(timer.end);
		return deferred.promise();
	};
	self.register = function (accountName, email) {
		var result = jQuery.Deferred();
		self.exec('license/register', {'to_email': email, 'account_name' : accountName})
			.then(function (jsonResponse) {
				if (jsonResponse.license) {
					goldLicenseManager.storeLicense(jsonResponse.license);
				}
				result.resolve(jsonResponse);
			},
			result.reject,
			result.notify);
		return result.promise();
	};
	self.getSubscription = function () {
		var license = goldLicenseManager.getLicense();
		return self.exec('license/subscription', {'license': JSON.stringify(license)});
	};
	self.cancelSubscription = function () {
		var license = goldLicenseManager.getLicense();
		return self.exec('license/cancel_subscription', {'license': JSON.stringify(license)});
	};
    /**
     * Creates an export configuration for server-side exports. See
     * {{#crossLink "LayoutExportController/startExport:method"}}{{/crossLink}}
     * for an example of how to use it.
     *
     * @method generateExportConfiguration
     * @param {String} format one of supported formats
     * @return {jQuery.Deferred} asynchronous promise that will be resolved with the export configuration
     */
	self.generateExportConfiguration = function (format) {
		var license = goldLicenseManager.getLicense();
		return self.exec('file/export_config', {'license': JSON.stringify(license), 'format': format});
	};
	self.generateEchoConfiguration = function (format, contentType) {
		var license = goldLicenseManager.getLicense();
		return self.exec('file/echo_config', {'license': JSON.stringify(license), 'format': format, 'contenttype': contentType});
	};
    /**
     * Request a one-time password from the Gold server. This method starts the remote authentication
     * workflow, and will result in a one-time password being sent to the e-mail address associated with the account.
     *
     * @method requestCode
     * @param {String} identifier email or account name
     * @param {String} [clientToken]
     * @return {jQuery.Deferred} an asynchronous promise that will resolve if the e-mail was sent from the server and reject in case of an error
     */
	self.requestCode = function (identifier) {
		currentOnetimePassword = MM.onetimePassword();
		currentIdentifier = identifier;
		return self.exec('license/request_code', {'identifier': identifier, 'one_time_pw': currentOnetimePassword});
	};
    /**
     * Load the license manager with the license, using a one time password sent by the Gold server. This
     * method completes the remote authentication worksflow.
     *
     * @method restoreLicenseWithCode
     * @param {String} code the one-time password received after requesting the code
     * @return {jQuery.Deferred} an asynchronous promise that will resolve or reject depending on the outcome. if successful, the GoldLicenseManager will have its license set.
     */
	self.restoreLicenseWithCode = function (code) {
		var deferred = jQuery.Deferred();
		if (currentOnetimePassword && currentIdentifier) {
			self.exec('license/request_license_using_code', {'identifier': currentIdentifier, 'one_time_pw': currentOnetimePassword, 'code': code}).then(
				function (license) {
					goldLicenseManager.storeLicense(license);
					deferred.resolve();
				},
				deferred.reject);
		} else {
			deferred.reject('no-code-requested');
		}
		return deferred.promise();
	};
	self.restoreLicenseWithGoogle = function (oauthToken) {
		var deferred = jQuery.Deferred();
		self.exec('license/request_license_using_google', {'token': oauthToken}).then(
			function (license) {
				goldLicenseManager.storeLicense(license);
				deferred.resolve();
			},
			deferred.reject);
		return deferred.promise();
	};
	self.listFiles = function (showLicenseDialog) {
		var deferred = jQuery.Deferred(),
			onListReturned = function (httpResult, account) {
				var parsed = jQuery(httpResult),
					list = [];
				parsed.find('Contents').each(function () {
					var element = jQuery(this),
						key = element.children('Key').text(),
						remove = key.indexOf('/') + 1;
					list.push({
						modifiedDate: element.children('LastModified').text(),
						title:  key.slice(remove)
					});
				});
				deferred.resolve(list, account);
			};
		licenseExec('file/list', showLicenseDialog).then(onListReturned, deferred.reject);
		return deferred.promise();
	};
	self.generateSaveConfig = function (showLicenseDialog) {
		return licenseExec('file/upload_config', showLicenseDialog);
	};
	self.fileUrl = function (showAuthenticationDialog, account, fileNameKey, signedUrl) {
		if (signedUrl) {
			return licenseExec('file/url', showAuthenticationDialog, {'file_key': encodeURIComponent(fileNameKey)}, account);
		} else {
			return jQuery.Deferred().resolve('https://' + goldBucketName + '.s3.amazonaws.com/' + account + '/' + encodeURIComponent(fileNameKey)).promise();
		}

	};
	self.exists = function (fileNameKey) {
		var deferred = jQuery.Deferred(),
			license = goldLicenseManager.getLicense();
		if (license) {
			self.exec('file/exists', {'license': JSON.stringify(license), 'file_key': encodeURIComponent(fileNameKey)}).then(
				function (httpResult) {
					var parsed = jQuery(httpResult);
					deferred.resolve(parsed.find('Contents').length > 0);
				},
				deferred.reject
				);
		} else {
			deferred.reject('not-authenticated');
		}
		return deferred.promise();
	};
	self.deleteFile = function (fileNameKey) {
		var deferred = jQuery.Deferred(),
			license = goldLicenseManager.getLicense();
		if (license) {
			self.exec('file/delete', {'license': JSON.stringify(license), 'file_key': fileNameKey}).then(
				deferred.resolve,
				deferred.reject
				);
		} else {
			deferred.reject('not-authenticated');
		}
		return deferred.promise();
	};
};
MM.onetimePassword = function () {
	'use strict';
	var s4 = function () {
		var rand = (1 + Math.random());
		return ((rand * 0x10000) || 0).toString(16).substring(1);
	};

	return s4() + '-' + s4();
};

/*global MM, observable */
MM.GoldFunnelModel = function (activityLog) {
	'use strict';
	var self = observable(this),
		funnelId = 'direct',
		logCategory = 'goldFunnel';
	self.setFunnelId = function (newFunnelId) {
		funnelId = newFunnelId;
	};
	self.step = function (segment, stepName) {
		activityLog.log(logCategory, segment + ':' + stepName, funnelId);
	};
};

/*global jQuery, window, _*/

jQuery.fn.mmUpdateInputField = function () {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
				fieldSelector = 'form[data-mm-role=' + element.data('mm-form') + '] [data-mm-role="' + element.data('mm-form-field') + '"]',
				field = jQuery(fieldSelector),
				siblingSelector = '[data-mm-role="form-input-updater"][data-mm-form="' + element.data('mm-form') + '"][data-mm-form-field="' + element.data('mm-form-field') + '"]';
		field.attr('value', element.val());
		jQuery(siblingSelector).not(element).val(element.val());
	});
};

jQuery.fn.goldLicenseEntryWidget = function (licenseManager, goldApi, activityLog, messageTarget, googleAuthenticator, goldFunnelModel) {
	'use strict';
	messageTarget = messageTarget || window;
	var self = this,
		openFromLicenseManager = false,
		remove = self.find('[data-mm-role~=remove]'),
		currentSection,
		audit = function (action, label) {
			if (label) {
				activityLog.log('Gold', action, label);
			} else {
				activityLog.log('Gold', action);
			}
		},
	showPaymentConfirmation = function () {
		var license = licenseManager.getLicense(),
			accountName = (license && license.account) || '';
		showSection('payment-complete');
		self.find('[data-mm-role~=account-name]').val(accountName).text(accountName);
	},
	displaySubscription = function (subscription) {
		var expiryTs = subscription && subscription.expiry,
			price = (subscription && subscription.price) || '',
			expiryDate = new Date(expiryTs * 1000),
			renewalDescription = (expiryDate && expiryDate.toDateString()) || '',
			license = licenseManager.getLicense(),
			accountName = (license && license.account) || '',
			provider  = subscription.provider ? ('-' + subscription.provider) : '';
		showSection('license-' + subscription.status + provider);
		self.find('[data-mm-role~=account-name]').val(accountName).text(accountName);
		self.find('[data-mm-role~=expiry-date]').val(renewalDescription).text(renewalDescription);
		self.find('[data-mm-role~=renewal-price]').val(price).text(price);

		_.each(subscription, function (val, key) {
			self.find('[data-mm-role~=license-' + key + ']').text(val);
		});
		if (subscription.actions) {
			_.each(subscription.actions, function (key) {
				self.find('[data-mm-role~=action-' + key + ']').show();
			});
		}
	},
		fillInFields = function () {
			var license = licenseManager.getLicense(),
				failExpiry = function (reason) {
					if (reason ===  'license-purchase-required') {
						showSection('license-purchase-required');
					} else if (currentSection === 'view-license' || currentSection === 'loading-subscription') {
						if (reason === 'not-authenticated') {
							showSection('invalid-license');
						}  else {
							showSection('license-server-unavailable');
						}
					}
				},
				showSubscription = function (subscription) {
					var licenseStatus = subscription && subscription.status;
					if (!licenseStatus) {
						failExpiry('not-authenticated');
					} else {
						displaySubscription(subscription);
					}
				},
				accountName = (license && license.account) || '';
			self.find('[data-mm-role~=account-name]').val(accountName).text(accountName);
			if (license) {
				self.find('[data-mm-role~=license-text]').val(JSON.stringify(license));
				self.find('[data-mm-role~=account-name]').val(license.account).text(license.account);
				if (currentSection === 'view-license') {// || currentSection === 'unauthorised-license') {
					showSection('loading-subscription');
					goldApi.getSubscription().then(showSubscription, failExpiry);
				}
			}  else {
				self.find('[data-mm-role~=license-text]').val('');
				self.find('[data-mm-role~=account-name]').val('').text('');
				self.find('[data-mm-role~=expiry-date]').val('').text('');
				self.find('[data-mm-role~=subscription-name]').val('').text('');
				self.find('[data-mm-role~=renewal-price]').val('').text('');
			}
			self.find('[data-mm-role~=form-input-updater]').mmUpdateInputField();
		},
		pollerIntervalId = false,
		previousSection,
		showSection = function (sectionName) {
			if (currentSection !== sectionName && goldFunnelModel) {
				goldFunnelModel.step('account-widget', sectionName);
			}
			var section = self.find('[data-mm-section~=' + sectionName + ']');
			if (pollerIntervalId) {
				window.clearInterval(pollerIntervalId);
			}
			previousSection = currentSection;
			currentSection = sectionName;
			audit('license-section', sectionName);
			self.find('[data-mm-section]').not('[data-mm-section~=' + sectionName + ']').hide();
			section.show();
			if (section.data('mm-poll-for-subscription')) {
				pollerIntervalId = window.setInterval(
					function () {
						goldApi.getSubscription().then(checkForPurchasedSubscription);
					},
				5000);
			}

		},
		initialSection = function (hasLicense, wasEntryRequired) {
			if (wasEntryRequired) {
				return hasLicense ? 'unauthorised-license' : 'license-required';
			}
			return hasLicense ? 'view-license' : 'no-license';
		},
		regSuccess = function (apiResponse) {
			/*jshint sub: true*/
			var license = licenseManager.getLicense(),
				account = (license && license.account) || apiResponse.email;
			self.find('[data-mm-role=license-capacity]').text(apiResponse.capacity);
			if (apiResponse.license) {
				self.find('[data-mm-role~=license-text]').val(apiResponse.license);
			}
			if (apiResponse['grace-period']) {
				self.find('[data-mm-role=license-grace-period]').text(apiResponse['grace-period']);
				self.find('[data-mm-role=license-has-grace-period]').show();
			} else {
				self.find('[data-mm-role=license-has-grace-period]').hide();
			}
			self.find('[data-mm-role=license-email]').text(apiResponse.email);
			self.find('[data-mm-role=account-name]').text(account).val(account);
			if (goldFunnelModel) {
				goldFunnelModel.step('account-widget', 'registration-complete');
			}

			showSection('registration-success');
		},
		regFail = function (apiReason) {
			self.find('[data-mm-section=registration-fail] .alert [data-mm-role]').hide();
			var message = self.find('[data-mm-section=registration-fail] .alert [data-mm-role~=' + apiReason + ']');
			if (message.length > 0) {
				message.show();
			} else {
				self.find('[data-mm-section=registration-fail] .alert [data-mm-role~=network-error]').show();
			}

			showSection('registration-fail');
		},
		register = function () {
			var registrationForm = self.find('[data-mm-section=' + currentSection + '] form'),
				emailField = registrationForm.find('input[name=email]'),
				accountNameField = registrationForm.find('input[name=account-name]'),
				termsField = registrationForm.find('input[name=terms]');

			if (goldFunnelModel) {
				goldFunnelModel.step('account-widget', 'registration-requested');
			}
			if (!/^[^@]+@[^@.]+\.[^@]+[^@.]$/.test(emailField.val())) {
				emailField.parents('div.control-group').addClass('error');
				if (goldFunnelModel) {
					goldFunnelModel.step('account-widget', 'registration-attempt-rejected:email');
				}
			} else {
				emailField.parents('div.control-group').removeClass('error');
			}
			if (!/^[a-z][a-z0-9]{3,20}$/.test(accountNameField.val())) {
				accountNameField.parents('div.control-group').addClass('error');
				if (goldFunnelModel) {
					goldFunnelModel.step('account-widget', 'registration-attempt-rejected:account-name');
				}
			} else {
				accountNameField.parents('div.control-group').removeClass('error');
			}
			if (!termsField.prop('checked')) {
				termsField.parents('div.control-group').addClass('error');
				if (goldFunnelModel) {
					goldFunnelModel.step('account-widget', 'registration-attempt-rejected:terms');
				}
			} else {
				termsField.parents('div.control-group').removeClass('error');
			}
			if (registrationForm.find('div.control-group').hasClass('error')) {
				return false;
			}
			if (goldFunnelModel) {
				goldFunnelModel.step('account-widget', 'registration-initiated');
			}
			goldApi.register(accountNameField.val(), emailField.val()).then(regSuccess, regFail);
			showSection('registration-progress');
		},
		checkForPurchasedSubscription = function (subscription) {
			var licenseStatus = subscription && subscription.status;
			if (licenseStatus === 'active') {
				licenseManager.completeLicenseEntry();
				showPaymentConfirmation();
			}
		},
		onWindowMessage = function (windowMessageEvt) {
			if (windowMessageEvt && windowMessageEvt.data && windowMessageEvt.data.goldApi) {
				audit('license-message', windowMessageEvt.data.goldApi);
				goldApi.getSubscription().then(checkForPurchasedSubscription);
			}
		},
		completeSubscriptionWorkflow = function () {
			goldApi.getSubscription().then(function (subscription) {
				var expiryTs = subscription && subscription.expiry;
				if (expiryTs > Date.now() / 1000) {
					licenseManager.completeLicenseEntry();
				}
			}
			/*TODO: come back to this!*/
			);
			showSection('view-license');
			fillInFields();
		};
	self.find('form').submit(function () {
		return this.action;
	});
	self.find('[data-mm-role~=form-submit]').click(function () {
		var id = jQuery(this).data('mm-form'),
				form = jQuery(id),
				subscriptionCode = form.find('[data-mm-role="subscription-code"]').val(),
				subscriptionInfo = subscriptionCode && form.find('[data-mm-subscription-code="' + subscriptionCode + '"]');

		if (subscriptionInfo) {
			form.find('[data-mm-role="subscription-description"]').val('Mindmup Gold ' + subscriptionInfo.text());
			form.find('[data-mm-role="subscription-amount-dollars"]').val(subscriptionInfo.data('mm-subscription-amount-dollars'));
			form.find('[data-mm-role="subscription-period"]').val(subscriptionInfo.data('mm-subscription-period'));
		}
		if (form.data('mm-next-section')) {
			showSection(form.data('mm-next-section'));
		}
		jQuery(id).submit();
	});
	self.find('[data-mm-role~=form-input-updater]').change(function () {
		jQuery(this).mmUpdateInputField();
	});

	self.on('show', function () {
		audit('license-show');
		var license = licenseManager.getLicense();
		self.find('input[type=text]').val('');
		showSection(initialSection(license, openFromLicenseManager));
		fillInFields();
	});
	self.on('shown', function () {
		if (self.find('[data-mm-role=gold-account-identifier]').is(':visible')) {
			self.find('[data-mm-role=gold-account-identifier]').focus();
		}
	});

	self.find('button[data-mm-role=view-subscription]').click(function () {
		showSection('view-license');
		fillInFields();
	});

	self.on('hidden', function () {
		licenseManager.cancelLicenseEntry();
		if (pollerIntervalId) {
			window.clearInterval(pollerIntervalId);
		}
		remove.show();
		openFromLicenseManager = false;
	});
	remove.click(function () {
		licenseManager.removeLicense();
		fillInFields();
		showSection('no-license');
	});
	self.find('button[data-mm-role~=show-section]').click(function () {
		showSection(jQuery(this).data('mm-target-section'));
	});

	self.find('button[data-mm-role~=register]').click(register);
	self.find('button[data-mm-role~=action-BuySubscription]').click(function () {
		if (goldFunnelModel) {
			goldFunnelModel.step('account-widget', 'payment-initiated');
		}
	});
	self.find('button[data-mm-role~=action-CancelSubscription]').click(function () {
		showSection('cancelling-subscription');
		goldApi.cancelSubscription().then(
			function () {
				showSection('cancelled-subscription');
			},
			function () {
				showSection('cancellation-failed');
			}
		);
	});
	self.find('button[data-mm-role~=go-back]').click(function () {
		if (previousSection) {
			showSection(previousSection);
		}
	});
	self.find('button[data-mm-role=kickoff-sign-up]').click(function () {
		showSection('register');
		self.find('#gold-register-account-name').focus();
	});
	self.find('[data-mm-role=kickoff-restore-license]').click(function () {
		var identiferField = self.find('[data-mm-role=gold-account-identifier]'),
			entered = identiferField.val();
		if (entered && entered.trim()) {
			identiferField.parents('div.control-group').removeClass('error');
			showSection('sending-code');
			goldApi.requestCode(entered.trim()).then(
				function () {
					showSection('code-sent');
				},
				function () {
					showSection('sending-code-failed');
				}
			);
		} else {
			identiferField.parents('div.control-group').addClass('error');
		}
	});
	self.find('[data-mm-role=restore-license-with-code]').click(function () {
		var codeField = self.find('[data-mm-role=gold-access-code]'),
			code = codeField.val();
		if (code && code.trim()) {
			showSection('sending-restore-license-code');
			goldApi.restoreLicenseWithCode(code.trim()).then(
				completeSubscriptionWorkflow,
				function () {
					showSection('restore-code-failed');
				});
		} else {
			codeField.parents('div.control-group').addClass('error');
		}
	});
	licenseManager.addEventListener('license-entry-required', function () {
		openFromLicenseManager = true;
		self.modal('show');
	});

	self.find('[data-mm-role=kickoff-google]').click(function () {
		var button = jQuery(this),
				showDialogs = !!button.attr('data-mm-showdialogs'),
				authWorked = function (authToken) {
				goldApi.restoreLicenseWithGoogle(authToken).then(
					completeSubscriptionWorkflow,
					function (responseCode) {
						if (responseCode && responseCode.indexOf('not-connected ') === 0) {
							var email = responseCode.substring('not-connected '.length);
							self.find('input[name=email]').val(email);
							showSection('google-auth-not-connected');
						} else {
							showSection('google-auth-failed');
						}
					}
				);
			},
			authFailed = function () {
				showSection('google-auth-failed');
			};
		showSection('google-auth-progress');
		googleAuthenticator.authenticate(showDialogs, true).then(
			authWorked,
			function () {
				if (!showDialogs) {
					showSection('google-auth-with-dialogs');
				} else {
					authFailed();
				}
			});
	});
	self.modal({keyboard: true, show: false});
	/*jshint camelcase: false*/
	messageTarget.addEventListener('message', onWindowMessage, false);
	return self;
};


/* global MM, observable, jQuery, _ */
/**
 * Utility method to manage the active Gold license in memory. Uses a browser storage to cache the license
 * and expects a visual widget to listen to observable events to handle possible authentication requests.
 *
 * The class is split out
 * from the {{#crossLink "GoldApi"}}{{/crossLink}} class so third-party users can provide an alternative
 * implementation that reads a license from disk or something similar.
 *
 * @class GoldLicenseManager
 * @constructor
 * @param {JsonStorage} storage an object store for license persistence
 * @param {String} storageKey the hash-key used to store the license in the storage
 */
MM.GoldLicenseManager = function (storage, storageKey) {
	'use strict';
	var self = this,
		currentDeferred,
		validFormat = function (license) {
			return license && license.accountType === 'mindmup-gold';
		};
	observable(this);
    /**
     * Get the current license from memory, without trying to asynchronously retrieve it from network
     *
     * @method getLicense
     * @return {Object} the current license from storage
     */
	this.getLicense = function () {
		return storage.getItem(storageKey);
	};
    /**
     * Asynchronous method which will try to get a local license, and if not available notify any observers to
     * show the UI for logging in or retrieving the license over network in some other way
     * @method retrieveLicense
     * @param {Boolean} forceAuthentication if true, force authentication even if logged in (eg to force a login or replacing an expired license)
     * @return {jQuery.Deferred} a promise that will be resolved when a license is finally set or rejected
     */
	this.retrieveLicense = function (forceAuthentication) {
		currentDeferred = undefined;
		if (!forceAuthentication && this.getLicense()) {
			return jQuery.Deferred().resolve(this.getLicense()).promise();
		}
		currentDeferred = jQuery.Deferred();
		self.dispatchEvent('license-entry-required');
		return currentDeferred.promise();
	};
    /**
     * Set the in-memory cached license
     *
     * @method storeLicense
     * @param {String or JSON} licenseArg gold license
     * @return true if the license is in correct format and storage accepted it, false otherwise
     */
	this.storeLicense = function (licenseArg) {
		var license = licenseArg;
		if (_.isString(licenseArg)) {
			try {
				license = JSON.parse(licenseArg);
			} catch (e) {
				return false;
			}
		}
		if (!validFormat(license)) {
			return false;
		}
		storage.setItem(storageKey, license);
		return true;
	};
	this.removeLicense = function () {
		storage.setItem(storageKey, undefined);
	};
    /**
     * Stop the current asynchronous license entry process, notifying all observers about failure.
     *
     * _This is an optional method, and you only need to re-implement it if you want to re-use the MindMup Gold License entry widget._
     *
     *
     * @method cancelLicenseEntry
     */
	this.cancelLicenseEntry = function () {
		var deferred = currentDeferred;
		if (currentDeferred) {
			currentDeferred = undefined;
			deferred.reject('user-cancel');
		}
	};
    /**
     * Complete the current asynchronous license entry, notifying all observers about successful completion. this implementation
     * expects that storeLicense was already called.
     *
     * _This is an optional method, and you only need to re-implement it if you want to re-use the MindMup Gold License entry widget._
     *
     * @method completeLicenseEntry
     */
	this.completeLicenseEntry = function () {
		var deferred = currentDeferred;
		if (currentDeferred) {
			currentDeferred = undefined;
			deferred.resolve(self.getLicense());
		}
	};
};

/*global jQuery, _ */

jQuery.fn.goldStorageOpenWidget = function (goldMapStorageAdapter, mapController) {
	'use strict';
	var modal = this,
		template = this.find('[data-mm-role=template]'),
		parent = template.parent(),
		statusDiv = this.find('[data-mm-role=status]'),
		showAlert = function (message, type, prompt, callback) {
			type = type || 'block';
			var html = '<div class="alert fade-in alert-' + type + '">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'<strong>' + message + '</strong>';
			if (callback && prompt) {
				html = html + '&nbsp;<a href="#" data-mm-role="auth">' + prompt + '</a>';
			}
			html = html + '</div>';
			statusDiv.html(html);
			jQuery('[data-mm-role=auth]').click(function () {
				statusDiv.empty();
				callback();
			});
		},
		showSection = function (sectionName) {
			modal.find('[data-mm-section]').hide();
			modal.find('[data-mm-section~="' + sectionName + '"]').show();

		},
		loaded = function (files) {
			statusDiv.empty();
			var sorted = [];
			sorted = _.sortBy(files, function (file) {
				return file && file.modifiedDate;
			}).reverse();
			if (sorted && sorted.length > 0) {
				_.each(sorted, function (file) {
					var added;
					if (file) {
						added = template.clone().appendTo(parent);
						added.find('[rel=tooltip]').tooltip();
						added.find('a[data-mm-role=file-link]')
							.text(file.title)
							.click(function () {
								modal.modal('hide');
								mapController.loadMap(file.id);
							});

						added.find('[data-mm-role~=map-delete]').click(function () {
							modal.find('[data-mm-section~="delete-map"] [data-mm-role~="map-name"]').text(file.title);
							showSection('delete-map');
						});
						added.find('[data-mm-role=modification-status]').text(new Date(file.modifiedDate).toLocaleString());
					}
				});
			} else {
				jQuery('<tr><td colspan="3">No maps found</td></tr>').appendTo(parent);
			}
		},
		fileRetrieval = function () {
			var networkError = function () {
				showAlert('Unable to retrieve files from Mindmup Gold due to a network error. Please try again later. If the problem persists, please <a href="mailto:contact@mindmup.com">contact us</a>.', 'error');
			};
			parent.empty();
			statusDiv.html('<i class="icon-spinner icon-spin"/> Retrieving files...');
			goldMapStorageAdapter.list(false).then(loaded,
				function (reason) {
					if (reason === 'not-authenticated') {
						goldMapStorageAdapter.list(true).then(loaded,
							function (reason) {
								if (reason === 'user-cancel') {
									modal.modal('hide');
								} else if (reason === 'not-authenticated') {
									showAlert('The license key is invalid. To obtain or renew a MindMup Gold License, please send us an e-mail at <a href="mailto:contact@mindmup.com">contact@mindmup.com</a>', 'error');
								} else {
									networkError();

								}
							});
					} else if (reason === 'user-cancel') {
						modal.modal('hide');
					} else {
						networkError();
					}
				});
		};
	template.detach();
	modal.find('[data-mm-target-section]').click(function () {
		var elem = jQuery(this),
				sectionName = elem.data('mm-target-section');
		showSection(sectionName);
	});
	modal.find('[data-mm-role~="delete-map-confirmed"]').click(function () {
		var mapName = modal.find('[data-mm-section~="delete-map"] [data-mm-role~="map-name"]').text();
		showSection('delete-map-in-progress');
		goldMapStorageAdapter.deleteMap(mapName).then(
			function () {
				showSection('delete-map-successful');
			},
			function (reason) {
				modal.find('[data-mm-section="delete-map-failed"] [data-mm-role="reason"]').text(reason);
				showSection('delete-map-failed');
			});
	});
	modal.on('show', function (evt) {
		if (this === evt.target) {
			showSection('file-list');
			fileRetrieval();
		}
	});
	modal.modal({keyboard: true, show: false, backdrop: 'static'});
	return modal;
};

/* global MM, jQuery, _*/

MM.GoldStorage = function (goldApi, s3Api, modalConfirmation, options) {
	'use strict';
	var self = this,
		fileProperties = {editable: true},
		privatePrefix,
		isRelatedPrefix = function (mapPrefix) {
			return mapPrefix && options && options[mapPrefix];
		},
		goldMapIdComponents = function (mapId) {
			var mapIdComponents = mapId && mapId.split('/');
			if (!mapIdComponents || mapIdComponents.length < 3) {
				return false;
			}
			if (!isRelatedPrefix(mapIdComponents[0])) {
				return false;
			}
			return {
				prefix: mapIdComponents[0],
				account: mapIdComponents[1],
				fileNameKey: decodeURIComponent(mapIdComponents[2])
			};
		},
		buildMapId = function (prefix, account, fileNameKey) {
			return prefix + '/' + account + '/' + encodeURIComponent(fileNameKey);
		};
	options = _.extend({'p': {isPrivate: true}, 'b': {isPrivate: false}, listPrefix: 'b'}, options);
	_.each(options, function (val, key) {
		if (val.isPrivate) {
			privatePrefix = key;
		}
	});
	self.fileSystemFor = function (prefix, description) {
		return {
			recognises: function (mapId) {
				return mapId && mapId[0] === prefix;
			},
			description: description || 'MindMup Gold',
			saveMap: function (contentToSave, mapId, fileName, showAuthenticationDialog) {
				return self.saveMap(prefix, contentToSave, mapId, fileName, showAuthenticationDialog);
			},
			loadMap: self.loadMap
		};
	};
	self.deleteMap = goldApi.deleteFile;
	self.list = function (showLicenseDialog) {
		var deferred = jQuery.Deferred(),
			onFileListReturned = function (fileList, account) {
				var prepend = options.listPrefix + '/' + account + '/',
					adaptItem = function (item) {
					return _.extend({id: prepend  + encodeURIComponent(item.title)}, item);
				};
				deferred.resolve(_.map(fileList, adaptItem));
			};
		goldApi.listFiles(showLicenseDialog).then(onFileListReturned, deferred.reject);
		return deferred.promise();
	};
	self.saveMap = function (prefix, contentToSave, mapId, fileName, showAuthenticationDialog) {
		var deferred = jQuery.Deferred(),
			s3FileName = function (goldMapInfo, account) {
				if (goldMapInfo && goldMapInfo.fileNameKey &&  goldMapInfo.account === account) {
					return goldMapInfo.fileNameKey;
				}
				return fileName;

			},
			onSaveConfig = function (saveConfig, account) {
				var goldMapInfo = goldMapIdComponents(mapId),
					s3FileNameKey = s3FileName(goldMapInfo, account),
					config = _.extend({}, saveConfig, {key: account + '/' + s3FileNameKey}),
					shouldCheckForDuplicate = function () {
						if (!goldMapInfo || account !== goldMapInfo.account) {
							return true;
						}
						return false;
					},
					onSaveComplete = function () {
						deferred.resolve(buildMapId(prefix, account, s3FileNameKey), fileProperties);
					},
					doSave = function () {
						s3Api.save(contentToSave, config, options[prefix]).then(onSaveComplete, deferred.reject);
					},
					doConfirm = function () {
						modalConfirmation.showModalToConfirm(
							'Confirm saving',
							'There is already a file with that name in your gold storage. Please confirm that you want to overwrite it, or cancel and rename the map before saving',
							'Overwrite'
						).then(
							doSave,
							deferred.reject.bind(deferred, 'user-cancel')
						);
					},
					checkForDuplicate = function () {
						goldApi.exists(s3FileNameKey).then(
							function (exists) {
								if (exists) {
									doConfirm();
								} else {
									doSave();
								}
							},
							deferred.reject
						);
					};
				if (shouldCheckForDuplicate()) {
					checkForDuplicate();
				} else {
					doSave();
				}

			};

		goldApi.generateSaveConfig(showAuthenticationDialog).then(onSaveConfig, deferred.reject);

		return deferred.promise();
	};
	self.loadMap = function (mapId, showAuthenticationDialog) {
		var deferred = jQuery.Deferred(),
			goldMapInfo = goldMapIdComponents(mapId),
			loadMapInternal = function (mapPrefix, account, fileNameKey) {
				var privateMap = options[mapPrefix].isPrivate;
				goldApi.fileUrl(showAuthenticationDialog, account, fileNameKey, privateMap).then(
					function (url) {
						s3Api.loadUrl(url).then(function (content) {
							deferred.resolve(content, buildMapId(mapPrefix, account, fileNameKey), 'application/json', fileProperties);
						},
						function (reason) {
							if (reason === 'map-not-found' && !privateMap && privatePrefix) {
								loadMapInternal(privatePrefix, account, fileNameKey);
							} else {
								deferred.reject(reason);
							}
						});
					},
					deferred.reject
				);
			};

		if (goldMapInfo) {
			loadMapInternal(goldMapInfo.prefix, goldMapInfo.account, goldMapInfo.fileNameKey);
		} else {
			deferred.reject('invalid-args');
		}
		return deferred.promise();
	};
};


/*global _, jQuery, MM, window, gapi, google, MediaUploader */
MM.GoogleAuthenticator = function (clientId, apiKey) {
	'use strict';
	var self = this,
		checkAuth = function (showDialog, requireEmail) {
			var deferred = jQuery.Deferred(),
					basicScopes = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install https://www.googleapis.com/auth/userinfo.profile';
			deferred.notify('Authenticating with Google');
			gapi.auth.authorize(
				{
					'client_id': clientId,
					'scope': requireEmail ? basicScopes + ' https://www.googleapis.com/auth/userinfo.email' : basicScopes,
					'immediate': !showDialog
				},
				function (authResult) {
					if (authResult && !authResult.error) {
						deferred.resolve(authResult.access_token);
					} else {
						deferred.reject('not-authenticated');
					}
				}
			);
			return deferred.promise();
		},
		loadApi = function (onComplete) {
			if (window.gapi && window.gapi.client) {
				onComplete();
			} else {
				window.googleClientLoaded = function () {
					gapi.client.setApiKey(apiKey);
					onComplete();
				};
				jQuery('<script src="https://apis.google.com/js/client.js?onload=googleClientLoaded"></script>').appendTo('body');
			}
		};
	self.gapiAuthToken = function () {
		return window.gapi && gapi.auth && gapi.auth.getToken() && gapi.auth.getToken().access_token;
	};
	self.isAuthorised = function () {
		return !!(self.gapiAuthToken());
	};
	self.authenticate = function (showAuthenticationDialogs, requireEmail) {
		var deferred = jQuery.Deferred(),
			failureReason = showAuthenticationDialogs ? 'failed-authentication' : 'not-authenticated';
		loadApi(function () {
			checkAuth(showAuthenticationDialogs, requireEmail).then(deferred.resolve, function () {
				deferred.reject(failureReason);
			},
			deferred.notify);
		});
		return deferred.promise();
	};
};
MM.GoogleDriveAdapter = function (authenticator, appId, networkTimeoutMillis, defaultContentType) {
	'use strict';
	var properties = {},
		driveLoaded,
		recognises = function (mapId) {
			return mapId && mapId[0] === 'g';
		},
		toGoogleFileId = function (mapId) {
			if (recognises(mapId)) {
				return mapId.substr(2);
			}
		},
		mindMupId = function (googleId) {
			return 'g1' + (googleId || '');
		},
		saveFile = function (contentToSave, mapId, fileName, paramContentType) {
			var	googleId =  toGoogleFileId(mapId),
				deferred = jQuery.Deferred(),
				boundary = '-------314159265358979323846',
				delimiter = '\r\n--' + boundary + '\r\n',
				closeDelim = '\r\n--' + boundary + '--',
				contentType = paramContentType || defaultContentType,
				metadata = {
					'title': fileName,
					'mimeType': contentType
				},
				multipartRequestBody =
					delimiter +
					'Content-Type: application/json\r\n\r\n' +
					JSON.stringify(metadata) +
					delimiter +
					'Content-Type: ' + contentType + '\r\n' +
					'\r\n' +
					contentToSave +
					closeDelim,
				request = gapi.client.request({
					'path': '/upload/drive/v2/files' + (googleId ? '/' + googleId : ''),
					'method': (googleId ? 'PUT' : 'POST'),
					'params': {'uploadType': 'multipart', 'useContentAsIndexableText': (contentToSave.length < 131072)}, /* google refuses indexable text larger than 128k, see https://developers.google.com/drive/file */
					'headers': {
						'Content-Type': 'multipart/mixed; boundary=\'' + boundary + '\''
					},
					'body': multipartRequestBody
				});
			try {
				deferred.notify('sending to Google Drive');
				request.execute(function (resp) {
					var retriable  = [404, 500, 502, 503, 504, -1];
					if (resp.error) {
						if (resp.error.code === 403) {
							if (resp.error.reason && (resp.error.reason === 'rateLimitExceeded' || resp.error.reason === 'userRateLimitExceeded')) {
								deferred.reject('network-error');
							} else {
								deferred.reject('no-access-allowed');
							}
						} else if (resp.error.code === 401) {
							authenticator.authenticate(false).then(
								function () {
									saveFile(contentToSave, mapId, fileName).then(deferred.resolve, deferred.reject, deferred.notify);
								},
								deferred.reject,
								deferred.notify
							);
						} else if (_.contains(retriable, resp.error.code)) {
							deferred.reject('network-error');
						} else {
							deferred.reject(resp.error);
						}
					} else {
						deferred.resolve(mindMupId(resp.id), properties);
					}
				});
			} catch (e) {
				deferred.reject('network-error', e.toString() + '\nstack: ' + e.stack + '\nauth: ' + JSON.stringify(gapi.auth.getToken()) + '\nnow: ' + Date.now());
			}
			return deferred.promise();
		},
		downloadFile = function (file) {
			var deferred = jQuery.Deferred(),
				fileSize = file && file.fileSize && parseFloat(file.fileSize),
				progressMessage = function (evt) {
					deferred.notify({total: fileSize, loaded: evt.loaded});
				};
			if (file.downloadUrl) {
				jQuery.ajax(
					file.downloadUrl,
					{
						progress: progressMessage,
						headers: {'Authorization': 'Bearer ' + gapi.auth.getToken().access_token }
					}
				).then(
					deferred.resolve,
					deferred.reject.bind(deferred, 'network-error')
				);
			} else {
				deferred.reject('no-file-url');

			}
			return deferred.promise();
		},
		loadFile = function (fileId) {
			var deferred = jQuery.Deferred(),
				request = gapi.client.drive.files.get({
					'fileId': fileId
				});
			request.execute(function (resp) {
				var mimeType = resp.mimeType;
				if (resp.error) {
					if (resp.error.code === 403) {
						deferred.reject('network-error');
					} else if (resp.error.code === 404) {
						deferred.reject('no-access-allowed');
					} else {
						deferred.reject(resp.error);
					}
				} else {
					downloadFile(resp).then(
						function (content) {
							deferred.resolve(content, mimeType);
						},
						deferred.reject,
						deferred.notify
					);
				}
			});
			return deferred.promise();
		},
		makeReady = function (showAuthenticationDialogs) {
			var deferred = jQuery.Deferred();
			authenticator.authenticate(showAuthenticationDialogs).then(function () {
				if (driveLoaded) {
					deferred.resolve();
				} else {
					deferred.notify('Loading Google Drive APIs');
					gapi.client.load('drive', 'v2', function () {
						driveLoaded = true;
						deferred.resolve();
					});
				}
			}, deferred.reject, deferred.notify);
			return deferred.promise();
		};
	this.description = 'Google';
	this.saveFile = saveFile;
	this.binaryUpload = function (blob, fileName, contentType, convertToInternal) {
		var result = jQuery.Deferred(),
				handleComplete = function (response) {
					var fileStatus;
					try {
						if (_.isString(response)) {
							fileStatus = JSON.parse(response);
						} else {
							fileStatus = response;
						}
						if (fileStatus.id && fileStatus.alternateLink) {
							result.resolve({'id': mindMupId(fileStatus.id), 'link': fileStatus.alternateLink});
						} else {
							result.reject('server-error', response);
						}
					} catch (e) {
						result.reject('server-error', response);
					}
				},
				handleError = function (response) {
					/* {
 "error": {
     "errors": [ { "domain": "global", "reason": "authError", "message": "Invalid Credentials", "locationType": "header", "location": "Authorization" }],
     "code": 401,
     "message": "Invalid Credentials"
  }
}*/
					var fileStatus;
					try {
						if (_.isString(response)) {
							fileStatus = JSON.parse(response);
						} else {
							fileStatus = response;
							if (!fileStatus.error) {
								result.reject('server-error', response);
							} else if (fileStatus.error.code === 401) {
								result.reject('not-authenticated');
							} else if (fileStatus.error.code === 403) {
								result.reject('no-access-allowed');
							} else {
								result.reject('network-error', fileStatus.message);
							}
						}
					} catch (e) {
						result.reject('server-error', response);
					}
				},
				handleProgress = function (oEvent) {
					if (oEvent.lengthComputable) {
						result.notify(Math.round((oEvent.loaded * 100) / oEvent.total, 2) + '%', oEvent);
					} else {
						result.notify(false, oEvent);
					}
				},
				params = {
					file: blob,
					metadata: { title: fileName, mimeType: contentType},
					token: authenticator.gapiAuthToken(),
					onComplete: handleComplete,
					onError: handleError,
					onProgress: handleProgress
				};
		if (convertToInternal) {
			params.params = {convert:true};
		}
		new MediaUploader(params).upload();
		return result.promise();
	};
	this.toGoogleFileId = toGoogleFileId;
	this.ready = function (showAuthenticationDialogs) {
		if (driveLoaded && authenticator.isAuthorised()) {
			return jQuery.Deferred().resolve();
		} else {
			return makeReady(showAuthenticationDialogs);
		}
	};

	this.recognises = recognises;

	this.loadMap = function (mapId, showAuthenticationDialogs) {
		var deferred = jQuery.Deferred(),
			googleId = toGoogleFileId(mapId),
			readySucceeded = function () {
				loadFile(googleId).then(
					function (content, mimeType) {
						deferred.resolve(content, mapId, mimeType, properties);
					},
					deferred.reject
				).progress(deferred.notify);
			};
		this.ready(showAuthenticationDialogs).then(readySucceeded, deferred.reject, deferred.notify);
		return deferred.promise();
	};

	this.saveMap = function (contentToSave, mapId, fileName, showAuthenticationDialogs) {
		var deferred = jQuery.Deferred();
		this.ready(showAuthenticationDialogs).then(
			function () {
				saveFile(contentToSave, mapId, fileName).then(deferred.resolve, deferred.reject, deferred.notify);
			},
			deferred.reject
		).progress(deferred.notify);
		return deferred.promise();
	};
	this.showSharingSettings = function (mindMupId) {
		var showDialog = function () {
			var shareClient = new gapi.drive.share.ShareClient(appId);
			shareClient.setItemIds(toGoogleFileId(mindMupId));
			shareClient.showSettingsDialog();
		};
		if (gapi && gapi.drive && gapi.drive.share) {
			showDialog();
		} else {
			this.ready(false).done(function () {
				gapi.load('drive-share', showDialog);
			});
		}
	};
	this.showPicker = function (contentTypes, title, showDialogs) {
		var deferred = jQuery.Deferred(),
			defaultContentTypes = 'application/octet-stream,application/vnd.mindmup.collab,application/vnd-freemind,application/json,application/vnd.google.drive.ext-type.mup,application/x-freemind,application/vnd.google.drive.ext-type.mm',
			showPicker = function () {
				var picker, view;
				view = new google.picker.DocsView(google.picker.ViewId.DOCS);
				view.setMimeTypes(contentTypes);
				view.setMode(google.picker.DocsViewMode.LIST);
				picker = new google.picker.PickerBuilder()
					.enableFeature(google.picker.Feature.NAV_HIDDEN)
					.setAppId(appId)
					.addView(view)
					.setCallback(function (choice) {
						if (choice.action === 'picked') {
							deferred.resolve(mindMupId(choice.docs[0].id));
							return;
						}
						if (choice.action === 'cancel') {
							deferred.reject();
						}
					})
					.setTitle(title)
					.setSelectableMimeTypes(contentTypes)
					.setOAuthToken(authenticator.gapiAuthToken())
					.build()
					.setVisible(true);
			};
		contentTypes = contentTypes || defaultContentTypes;
		if (window.google && window.google.picker) {
			showPicker();
		} else {
			this.ready(showDialogs).then(
				function () {
					gapi.load('picker', showPicker);
				},
				deferred.reject,
				deferred.notify
			);
		}
		return deferred.promise();
	};
};


/*global $ */
$.fn.googleDriveOpenWidget = function (googleDriveRepository, mapController, modalConfirmation, activityLog) {
	'use strict';
	var element = this,
		defaultTitle = 'Open a MindMup or Freemind file from Google Drive';
	element.click(function () {
		var link = $(this),
			contentTypes = link.data('mm-content-types'),
			title = link.data('mm-title') || defaultTitle,
			showFailure = function (reason) {
				activityLog.error(reason);
			},
			showAlert = function (reason) {
				activityLog.log(reason);
			},
			loadMap = function (mapId) {
				mapController.loadMap(mapId);
			},
			showAuthentication = function (reason) {
				if (reason !== 'not-authenticated') {
					return;
				}
				modalConfirmation.showModalToConfirm('Please confirm external access',
					'This operation requires authentication through Google Drive, an external storage provider. ' +
						'Please click on Authenticate below to go to the external provider and allow MindMup to access your account. ' +
						'You can learn more about authentication requirements on our <a href="http://blog.mindmup.com/p/storage-options.html" target="_blank">Storage Options</a> page.',
					'Authenticate')
					.then(
						function () {
							googleDriveRepository.showPicker(contentTypes, title, true).then(
								loadMap,
								showFailure,
								showAlert
							);
						}
					);
			};
		googleDriveRepository.showPicker(contentTypes, title, false).then(
			loadMap,
			showAuthentication,
			showAlert
		);
	});
};

/*global jQuery */
jQuery.fn.googleShareWidget = function (mapController, googleDriveAdapter) {
	'use strict';
	return this.click(function () {
		googleDriveAdapter.showSharingSettings(mapController.currentMapId());
	});
};

/*global jQuery, _*/

jQuery.fn.gridDown = function () {
	'use strict';
	var element = this,
		elementPos = element.position(),
		below = _.filter(element.siblings(), function (sibling) {
			var position = jQuery(sibling).position();
			return elementPos.top < position.top && Math.abs(elementPos.left - position.left) < 3;
		}),
		nearest = _.min(below, function (item) {
			return jQuery(item).position().top;
		});
	return (nearest && jQuery(nearest)) || element;
};

jQuery.fn.gridUp = function () {
	'use strict';
	var element = this,
		elementPos = element.position(),
		above = _.filter(element.siblings(), function (sibling) {
			var position = jQuery(sibling).position();
			return elementPos.top > position.top && Math.abs(elementPos.left - position.left) < 3;
		}),
		nearest = _.max(above, function (item) {
			return jQuery(item).position().top;
		});
	return (nearest && jQuery(nearest)) || element;
};

/*global jQuery, MAPJS, MM, observable */

MM.iconEditor = function (mapModel, resourceManager) {
	'use strict';
	observable(this);
	var currentDeferred,
		self = this;
	this.editIcon = function (icon) {
		if (icon) {
			icon.url = resourceManager.getResource(icon.url);
		}
		currentDeferred = jQuery.Deferred();
		this.dispatchEvent('iconEditRequested', icon);
		return currentDeferred.promise();
	};
	this.save = function (icon) {
		currentDeferred.resolve(icon);
	};
	this.cancel = function () {
		currentDeferred.reject();
	};

	mapModel.addEventListener('nodeIconEditRequested', function () {
		var icon = mapModel.getIcon();
		self.editIcon(icon).then(function (result) {
			if (result) {
				mapModel.setIcon('icon-editor', resourceManager.storeResource(result.url), result.width, result.height, result.position);
			} else {
				mapModel.setIcon(false);
			}
		});
	});

};
jQuery.fn.iconEditorWidget = function (iconEditor, corsProxyUrl) {
	'use strict';
	var self = this,
		confirmElement = self.find('[data-mm-role~=confirm]'),
		sizeSelect = self.find('form select[name=size]'),
		customSizeBox = self.find('[data-mm-role=custom-size-enter]'),
		imgPreview = self.find('[data-mm-role=img-preview]'),
		clearButton = self.find('[data-mm-role~=clear]'),
		positionSelect = self.find('select[name=position]'),
		widthBox = self.find('input[name=width]'),
		heightBox = self.find('input[name=height]'),
		ratioBox = self.find('input[name=keepratio]'),
		fileUpload = self.find('input[name=selectfile]'),
		dropZone = self.find('[data-mm-role=drop-zone]'),
		selectFile = self.find('[data-mm-role=select-file]'),
		doConfirm = function () {
			iconEditor.save({
				url: imgPreview.attr('src'),
				width: Math.round(widthBox.val()),
				height: Math.round(heightBox.val()),
				position: positionSelect.val()
			});
		},
		doClear = function () {
			iconEditor.save(false);
		},
		loadForm = function (icon) {
			if (!icon) {
				imgPreview.hide();
				self.find('[data-mm-role=attribs]').hide();
				clearButton.hide();
				confirmElement.hide();
			} else {
				imgPreview.show();
				imgPreview.attr('src', icon.url);
				self.find('[data-mm-role=attribs]').show();
				positionSelect.val(icon.position);
				widthBox.val(icon.width);
				heightBox.val(icon.height);
				fileUpload.val('');
				clearButton.show();
				confirmElement.show();
			}
		},
		openFile = function () {
			fileUpload.click();
		},
		insertController = new MAPJS.ImageInsertController(corsProxyUrl);
	selectFile.click(openFile).keydown('space enter', openFile);
	insertController.addEventListener('imageInserted',
		function (dataUrl, imgWidth, imgHeight) {
			imgPreview.attr('src', dataUrl);
			widthBox.val(imgWidth);
			heightBox.val(imgHeight);
			self.find('[data-mm-role=attribs]').show();
			imgPreview.show();
			confirmElement.show();
			confirmElement.focus();
		}
	);
	dropZone.imageDropWidget(insertController);
	widthBox.on('change', function () {
		if (ratioBox[0].checked) {
			heightBox.val(Math.round(imgPreview.height() * parseInt(widthBox.val(), 10) / imgPreview.width()));
		}
	});
	heightBox.on('change', function () {
		if (ratioBox[0].checked) {
			widthBox.val(Math.round(imgPreview.width() * parseInt(heightBox.val(), 10) / imgPreview.height()));
		}
	});
	fileUpload.on('change', function (e) {
		insertController.insertFiles(this.files, e);
	});
	self.modal({keyboard: true, show: false});
	confirmElement.click(function () {
		doConfirm();
	}).keydown('space', function () {
		doConfirm();
		self.modal('hide');
	});
	clearButton.click(function () {
		doClear();
	}).keydown('space', function () {
		doClear();
		self.modal('hide');
	});
	sizeSelect.on('change', function () {
		if (sizeSelect.val() === 'custom') {
			customSizeBox.show();
		} else {
			customSizeBox.hide();
		}
	});
	this.on('show', function () {
		fileUpload.css('opacity', 0).val('');
	});
	this.on('shown', function () {
		fileUpload.css('opacity', 0).css('position', 'absolute')
			.offset(dropZone.offset()).width(dropZone.outerWidth()).height(dropZone.outerHeight());
		selectFile.focus();
	});
	iconEditor.addEventListener('iconEditRequested', function (icon) {
		loadForm(icon);
		self.modal('show');
	});
	return this;
};

/*global MM*/
MM.setImageAlertWidget = function (imageInsertController, alertController) {
	'use strict';
	var alertControllerId;
	imageInsertController.addEventListener('imageInserted', function () {
		alertController.hide(alertControllerId);
	});
	imageInsertController.addEventListener('imageInsertError', function () {
		alertController.hide(alertControllerId);
		alertControllerId = alertController.show('Cannot insert image from this website:', 'Please save the image locally and drag the saved file to add it to the map', 'error');
	});
	imageInsertController.addEventListener('imageLoadStarted', function () {
		alertController.hide(alertControllerId);
		alertControllerId = alertController.show('<i class="icon-spinner icon-spin"/> Loading image');
	});
};

/*global $, MAPJS, MM, window*/
$.fn.importWidget = function (activityLog, mapController) {
	'use strict';
	var element = this,
		uploadType,
		statusDiv = element.find('[data-mm-role=status]'),
		fileInput = element.find('input[type=file]'),
		selectButton = element.find('[data-mm-role=select-file]'),
		spinner = function (text) {
			statusDiv.html('<i class="icon-spinner icon-spin"/> ' + text);
		},
		start = function (filename) {
			activityLog.log('Map', 'import:start ' + uploadType, filename);
			spinner('Uploading ' + filename);
		},
		parseFile = function (fileContent, type) {
			var counter = 0,
				expected;
			if (type === 'mm') {
				return MM.freemindImport(fileContent,
					function (total) {
						expected = total;
					},
					function () {
						var pct = (100 * counter / expected).toFixed(2) + '%';
						if (counter % 1000 === 0) {
							spinner('Converted ' + pct);
						}
						counter++;
					});
			}
			if (type === 'mup') {
				return JSON.parse(fileContent);
			}
		},
		fail = function (error) {
			activityLog.log('Map', 'import:fail', error);
			statusDiv.html(
				'<div class="alert fade in alert-error">' +
					'<strong>' + error + '</strong>' +
					'</div>'
			);
		},
		success = function (fileContent, type) {
			var idea, jsonContent;
			spinner('Processing file');
			if (type !== 'mup' && type !== 'mm') {
				fail('unsupported format ' + type);
			}
			try {
				jsonContent = parseFile(fileContent, type);
				spinner('Initialising map');
				idea = MAPJS.content(jsonContent);
			} catch (e) {
				fail('invalid file content', e);
				return;
			}
			spinner('Done');
			activityLog.log('Map', 'import:complete');
			statusDiv.empty();
			element.modal('hide');
			mapController.setMap(idea);
		},
		shouldUseFileReader = function () {
			return (window.File && window.FileReader && window.FileList && window.Blob && (!$('body').hasClass('disable-filereader')));
		};
	if (shouldUseFileReader()) {
		/*jshint camelcase:false*/
		fileInput.file_reader_upload(start, success, fail);
		uploadType = 'FileReader';
	} else {
		fail('This browser does not support importing from local disk');
		selectButton.hide();
	}
	element.on('shown', function () {
		fileInput.css('opacity', 0).css('position', 'absolute').offset(selectButton.offset()).width(selectButton.outerWidth())
			.height(selectButton.outerHeight());
		selectButton.focus();
	});
	selectButton.keydown('space return', function () {
		fileInput.click();
	});
	return element;
};

/*global MM, _*/
/**
 * A simple wrapper that allows objects to be stored as JSON strings in a HTML5 storage. It
 * automatically applies JSON.stringify and JSON.parse when storing and retrieving objects
 *
 * @class JsonStorage
 * @constructor
 * @param {Object} storage object implementing the following API (for example a HTML5 localStorage)
 * @param {function} storage.setItem function(String key, String value)
 * @param {function} storage.getItem function(String key)
 * @param {function} storage.removeItem function(String key)
 */
MM.JsonStorage = function (storage) {
	'use strict';
	var self = this;
	/**
	 * Store an object under a key
	 * @method setItem
	 * @param {String} key the storage key
	 * @param {Object} value an object to be stored, has to be JSON serializable
	 */
	self.setItem = function (key, value) {
		return storage.setItem(key, JSON.stringify(value));
	};
	/**
	 * Get an item from storage
	 * @method getItem
	 * @param {String} key the storage key used to save the object
	 * @return {Object} a JSON-parsed object from storage
	 */
	self.getItem = function (key) {
		var item = storage.getItem(key);
		try {
			return JSON.parse(item);
		} catch (e) {
		}
	};
	/**
	 * Remove an object from storage
	 * @method remove
	 * @param {String} key the storage key used to save the object
	 */
	self.remove = function (key) {
		storage.removeItem(key);
	};

	self.removeKeysWithPrefix = function (prefixToMatch) {
		if (_.isEmpty(prefixToMatch)) {
			return 0;
		}
		var keysToMatch = Object.keys(storage),
			keysToRemove = _.filter(keysToMatch, function (key) {
				return key.indexOf(prefixToMatch) === 0;
			});
		_.each(keysToRemove, function (key) {
			storage.removeItem(key);
		});
		return keysToRemove.length;
	};
};

/*global jQuery */
jQuery.fn.keyActionsWidget = function () {
	'use strict';
	var element = this;
	this.find('[data-mm-role~=dismiss-modal]').click(function () {
		element.modal('hide');
	});
	element.on('show', function () {
		element.find('.active').removeClass('active');
		element.find('.carousel-inner').children('.item').first().addClass('active');
	});
};

/*global jQuery, MM, _, MAPJS */
/**
 * Utility class that implements the workflow for requesting an export and polling for results.
 *
 * ## Export workflow
 *
 * MindMup.com supports several server processes that convert map (or layout) files into other formats (images, slides etc).
 * These server side resources require a valid Gold license for storage and billing, so the access is controlled
 * using the {{#crossLink "GoldApi"}}{{/crossLink}}. The general workflow to order an export is:
 *
 * 1. Ask the Gold API for an upload token for a particular upload format.
 *    The Gold API will reply with all information required to upload a file to
 *    Amazon S3, as well as signed URLs to check for the conversion result or error
 * 2. Upload the source content to Amazon S3. Note that some formats require a layout, some require an entire map.
 * 3. Poll the result and error URLs periodically. If the file appears on the result URL, download it and send to users. If
 *    a file appears on the error URL or nothing appears until the polling timeout, fail and stop polling
 *
 * This class coordinates all the complexity of the workflow and conversions in a simple convenience method.
 *
 * ## Export formats
 *
 * Currently supported formats are:
 *    * pdf - the map file as a scalable vector PDF
 *    * png - the map as a bitmap image (PNG)
 *    * presentation.pdf - the slideshow as a scalable vector PDF
 *    * presentation.pptx - the slideshow as a PowerPoint file
 *    * storyboard.docx - the slideshow as a PowerPoint file
 *
 * In general, the exporters do not work on raw map files, but on layouts already positioned by the client browser. The pdf and png
 * export formats require a map layout to be uploaded to the server. The storyboard exporters require a JSON version of the storyboard.
 * There are several utility functions that generate the appropriate content for each format. For an example of how to generate the
 * right data to send it up, see https://github.com/mindmup/mindmup/blob/master/public/main.js
 *
 * ### Additional properties
 *
 * The PDF format requires the following additional properties to be specified when starting the export
 *
 *     {export: {'orientation': String, 'page-size': String, 'margin': int }}
 *
 * * orientation can be either 'portrait' or 'landscape'
 * * page-size can be A0, A1, A2, A3, A4, A5
 *
 * @class LayoutExportController
 * @constructor
 * @param {Object} exportFunctions a hash-map _format -> function_ that produces a JSON object which will be uploaded to the server
 * @param {Object} configurationGenerator object implementing the following API (for example a {{#crossLink "GoldApi"}}{{/crossLink}} instance)
 * @param {function} configurationGenerator.generateExportConfiguration (String format)
 * @param {Object} storageApi object implementing the following API (for example a {{#crossLink "S3Api"}}{{/crossLink}} instance):
 * @param {function} storageApi.save (String content, Object configuration, Object properties)
 * @param {function} storageApi.poll (URL urlToPoll, Object options)
 * @param {ActivityLog} activityLog logging interface
 */
MM.LayoutExportController = function (formatFunctions, configurationGenerator, storageApi, activityLog, goldFunnelModel) {
	'use strict';
	var self = this,
		category = 'Map',
		getEventType = function (format) {
			if (!format) {
				return 'Export';
			}
			return format.toUpperCase() + ' Export';
		},
		getExportFunction = function (format) {
			return formatFunctions[format].exporter || formatFunctions[format];
		},
		postProcess = function (format, url, exportProperties) {
			var result = {'output-url': url};
			if (formatFunctions[format].processor) {
				return formatFunctions[format].processor(_.extend(result, exportProperties));
			}
			return jQuery.Deferred().resolve(result).promise();
		};
	/**
     * Kick-off an export workflow
     *
     * This method will generate the content to export by calling the appropriate export function, merge optional
     * generic data with the result, upload the document to the server and poll until it receives an error or a result
     *
     * @method startExport
     * @param {String} format one of the supported formats, provided in the constructor
     * @param [exportProperties] any generic properties that will be merged into the object generated by an export function before uploading
     * @return {jQuery.Deferred} a jQuery promise that will be resolved with the URL of the exported document if successful
     */
	self.startExport = function (format, exportProperties) {
		var deferred = jQuery.Deferred(),
			eventType = getEventType(format),
			isStopped = function () {
				return deferred.state() !== 'pending';
			},
			reject = function (reason, fileId) {
				if (reason === 'file-too-large' && goldFunnelModel) {
					goldFunnelModel.step('layout-export', 'file-too-large');
				}
				activityLog.log(category, eventType + ' failed', reason);
				deferred.reject(reason, fileId);
			},
			progress = function (progressEvent) {
				deferred.notify('Uploading ' + (progressEvent || ''));
			},
			exported = getExportFunction(format)(),
			layout = _.extend({}, exported, exportProperties);
		if (_.isEmpty(exported)) {
			return deferred.reject('empty').promise();
		}
		activityLog.log(category, eventType + ' started');
		deferred.notify('Setting up the export');
		if (goldFunnelModel) {
			goldFunnelModel.setFunnelId('export-' + format);
		}
		configurationGenerator.generateExportConfiguration(format).then(
			function (exportConfig) {
				var fileId = exportConfig.s3UploadIdentifier;
				storageApi.save(JSON.stringify(layout), exportConfig, {isPrivate: true}).then(
					function () {
						var pollTimer = activityLog.timer(category, eventType + ':polling-completed'),
							pollTimeoutTimer = activityLog.timer(category, eventType + ':polling-timeout'),
							pollErrorTimer = activityLog.timer(category, eventType + ':polling-error'),
							resolve = function () {
								pollTimer.end();
								activityLog.log(category, eventType + ' completed');
								postProcess(format, exportConfig.signedOutputUrl, exportProperties).then(function (result) {
									deferred.resolve(result, fileId);
								}, function (reason) {
									reject(reason, fileId);
								});
							};
						deferred.notify('Processing your export');
						storageApi.poll(exportConfig.signedErrorListUrl, {stoppedSemaphore: isStopped, sleepPeriod: 15000}).then(
							function () {
								pollErrorTimer.end();
								reject('generation-error', fileId);
							});
						storageApi.poll(exportConfig.signedOutputListUrl, {stoppedSemaphore: isStopped, sleepPeriod: 2500}).then(
							resolve,
							function (reason) {
								pollTimeoutTimer.end();
								reject(reason, fileId);
							});
					},
					reject,
					progress
				);
			},
			reject
		);
		return deferred.promise();
	};
};

jQuery.fn.layoutExportWidget = function (layoutExportController) {
	'use strict';
	return this.each(function () {
		var self = jQuery(this),
			selectedFormat = function () {
				var selector = self.find('[data-mm-role=format-selector]');
				if (selector && selector.val()) {
					return selector.val();
				} else {
					return self.data('mm-format');
				}
			},
			confirmElement = self.find('[data-mm-role~=start-export]'),
			setState = function (state) {
				self.find('.visible').hide();
				self.find('.visible' + '.' + state).show().find('[data-mm-show-focus]').focus();
				self.trigger(jQuery.Event('stateChanged', {'state': state}));
			},
			publishResult = function (result) {
				_.each(result, function (value, key) {
					self.find('[data-mm-role~=' + key + ']').each(function () {
						var element = jQuery(this);
						if (element.prop('tagName') === 'A') {
							element.attr('href', value);
						} else if (element.prop('tagName') === 'INPUT' || element.prop('tagName') === 'TEXTAREA') {
							element.val(value).attr('data-mm-val', value);
						} else if (element.prop('tagName') === 'DIV') {
							if (_.contains(element.attr('data-mm-role').split(' '), value)) {
								element.show();
							} else {
								element.hide();
							}
						}
					});
				});
				setState('done');
			},
			publishProgress = function (progress) {
				self.find('[data-mm-role=publish-progress-message]').text(progress);
			},
			getExportMetadata = function () {
				var form = self.find('form[data-mm-role~=export-parameters]'),
					meta = {};
				if (form) {
					form.find('button.active').add(form.find('select')).add(form.find('input')).each(function () {
						meta[jQuery(this).attr('name')] = jQuery(this).val() || jQuery(this).attr('placeholder');
					});
				}
				return meta;
			},
			exportFailed = function (reason, fileId) {
				if (!fileId && reason !== 'empty') {
					reason = 'network-error';
					fileId = 'NO-FILE-ID';
				}
				self.find('[data-mm-role=contact-email]').attr('href', function () {
					return 'mailto:' + jQuery(this).text() + '?subject=MindMup%20' + selectedFormat().toUpperCase() + '%20Export%20Error%20' + fileId;
				});
				self.find('[data-mm-role=file-id]').html(fileId);
				self.find('.error span').hide();
				setState('error');

				var predefinedMsg = self.find('[data-mm-role=' + reason + ']');
				if (predefinedMsg.length > 0) {
					predefinedMsg.show();
				} else {
					self.find('[data-mm-role=error-message]').html(reason).show();
				}
			},
			doExport = function () {
				setState('inprogress');
				layoutExportController.startExport(selectedFormat(), {'export': getExportMetadata()}).then(publishResult, exportFailed, publishProgress);
			};
		self.find('form').submit(function () {
			return false;
		});
		confirmElement.click(doExport).keydown('space', doExport);
		self.modal({keyboard: true, show: false, backdrop: 'static'});
		self.find('[data-mm-role=set-state]').click(function () {
			setState(jQuery(this).attr('data-mm-state'));
		});
		self.on('show', function (evt) {
			if (this === evt.target) {
				setState('initial');
			}
		});
	});
};
MM.buildMapLayoutExporter = function (mapModel, resourceTranslator) {
	'use strict';
	return function () {
		var layout = mapModel.getCurrentLayout();
		if (layout && layout.nodes) {
			_.each(layout.nodes, function (node) {
				if (node.attr && node.attr.icon && node.attr.icon.url) {
					node.attr.icon.url = resourceTranslator(node.attr.icon.url);
				}
			});
		}
		return layout;
	};
};
MM.buildMapContentExporter = function (activeContentListener, resourceTranslator) {
	'use strict';
	return function () {
		var clone = MAPJS.content(JSON.parse(JSON.stringify(activeContentListener.getActiveContent())));
		clone.traverse(function (node) {
			if (node.attr && node.attr.icon && node.attr.icon.url) {
				node.attr.icon.url = resourceTranslator(node.attr.icon.url);
			}
		});
		return clone;
	};
};
MM.ajaxResultProcessor = function (exportConfig) {
	'use strict';
	var result = jQuery.Deferred();
	jQuery.ajax({url: exportConfig['output-url'], dataType: 'json'}).then(
			function (jsonContent) {
				result.resolve(_.extend({}, exportConfig, jsonContent));
			},
			function () {
				result.reject('generation-error');
			}
	);
	return result.promise();
};

MM.layoutExportDecorators = {};
MM.layoutExportDecorators.twitterIntentResultDecorator = function (exportResult) {
	'use strict';
	exportResult['twitter-url'] =  'https://twitter.com/intent/tweet?text=' + encodeURIComponent(exportResult.export.title) +
		'&url=' + encodeURIComponent(exportResult['index-html']) +
		'&source=mindmup.com&related=mindmup&via=mindmup';
};
MM.layoutExportDecorators.facebookResultDecorator = function (exportResult) {
	'use strict';
	exportResult['facebook-url'] = 'https://www.facebook.com/dialog/share_open_graph?' +
		'app_id=621299297886954' +
		'&display=popup' +
		'&action_type=og.likes' +
		'&action_properties=%7B%22object%22%3A%22' + encodeURIComponent(exportResult['index-html']) + '%22%7D' +
		'&redirect_uri=' + encodeURIComponent('http://www.mindmup.com/fb');
};
MM.layoutExportDecorators.googlePlusResultDecorator = function (exportResult) {
	'use strict';
	exportResult['google-plus-url'] = 'https://plus.google.com/share?url=' + encodeURIComponent(exportResult['index-html']);
};
MM.layoutExportDecorators.linkedinResultDecorator = function (exportResult) {
	'use strict';
	exportResult['linkedin-url'] = 'http://www.linkedin.com/shareArticle?mini=true' +
		'&url=' + encodeURIComponent(exportResult['index-html']) +
		'&title=' + encodeURIComponent(exportResult.export.title) +
		'&summary=' + encodeURIComponent(exportResult.export.description) +
		'&source=MindMup';

};
MM.layoutExportDecorators.tumblrResultDecorator = function (exportResult) {
	'use strict';
	exportResult['tumblr-url'] = 'http://www.tumblr.com/share/link?url=' + encodeURIComponent(exportResult['index-html']) +
		'&name=' + encodeURIComponent(exportResult.export.title) +
		'&description=' + encodeURIComponent(exportResult.export.description);
};
MM.layoutExportDecorators.pinterestResultDecorator = function (exportResult) {
	'use strict';
	exportResult['pinterest-url'] = 'https://pinterest.com/pin/create/button/?media=' + encodeURIComponent(exportResult['thumb-png']) + '&url=' + encodeURIComponent(exportResult['index-html']) + '&is_video=false&description=' + encodeURIComponent(exportResult.export.description);
};
MM.layoutExportDecorators.embedResultDecorator = function (exportResult) {
	'use strict';
	exportResult['embed-markup'] = '<iframe src="' + exportResult['index-html'] + '"></iframe>';
};

MM.layoutExportDecorators.gmailResultDecorator = function (exportResult) {
	'use strict';
	exportResult['gmail-index-html'] = 'https://mail.google.com/mail/u/0/?view=cm&ui=2&cmid=0&fs=1&tf=1&body=' + encodeURIComponent(exportResult.export.title + '\n\n') + encodeURIComponent(exportResult['index-html']);
};

MM.layoutExportDecorators.emailResultDecorator = function (exportResult) {
	'use strict';
	exportResult['email-index-html'] = 'mailto:?subject=' + encodeURIComponent(exportResult.export.title) + '&body=' + encodeURIComponent(exportResult.export.description + ':\r\n\r\n') + encodeURIComponent(exportResult['index-html']);
};

MM.layoutExportDecorators.gmailZipResultDecorator = function (exportResult) {
	'use strict';
	exportResult['gmail-archive-zip'] = 'https://mail.google.com/mail/u/0/?view=cm&ui=2&cmid=0&fs=1&tf=1&body=' + encodeURIComponent(exportResult.export.title + '\n\n') + encodeURIComponent(exportResult['archive-zip']);
};
MM.layoutExportDecorators.emailZipResultDecorator = function (exportResult) {
	'use strict';
	exportResult['email-archive-zip'] = 'mailto:?subject=' + encodeURIComponent(exportResult.export.title) + '&body=' + encodeURIComponent(exportResult.export.description + ':\r\n\r\n') + encodeURIComponent(exportResult['archive-zip']);
};
MM.sendExportDecorators = {};
MM.sendExportDecorators.emailOutputUrlDecorator = function (exportResult) {
	'use strict';
	exportResult['email-output-url'] = 'mailto:?&body=' + encodeURIComponent(exportResult['output-url'] + '\n\nThe link will be valid for 24 hours');
};
MM.sendExportDecorators.gmailOutputUrlResultDecorator = function (exportResult) {
	'use strict';
	exportResult['gmail-output-url'] = 'https://mail.google.com/mail/u/0/?view=cm&ui=2&cmid=0&fs=1&tf=1&body=' + encodeURIComponent(exportResult['output-url'] + '\n\n the link will be valid for 24 hours');
};
MM.buildDecoratedResultProcessor = function (resultProcessor, decorators) {
	'use strict';
	return function (exportConfig) {
		var deferred = jQuery.Deferred();
		resultProcessor(exportConfig).then(function (result) {
			_.each(decorators, function (decorator) {
				decorator(result);
			});
			deferred.resolve(result);
		},
		deferred.reject);
		return deferred.promise();
	};
};

/*global jQuery*/

jQuery.fn.legacyAlertWidget = function (propertyStorage, propertyName, tagElement, alertController) {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			alertId;
		element.detach();
		if (propertyStorage.getItem(propertyName)) {
			return;
		}
		element.find('[data-mm-role="legacy-alert-hide"]').click(function () {
			propertyStorage.setItem(propertyName, true);
			if (alertId) {
				alertController.hide(alertId);
			}
		});
		alertId = alertController.show(element, 'info');
	});
};

/*global MM, jQuery, _, MAPJS*/
MM.LocalStorageClipboard = function (storage, key, alertController, resourceManager) {
	'use strict';
	var self = this,
			deepClone = function (o) {
				return JSON.parse(JSON.stringify(o));
			},
			processResources = function (object, predicate) {
				var result;
				if (!object) {
					return object;
				}
				if (_.isArray(object)) {
					return _.map(object, function (item) {
						return processResources(item, predicate);
					});
				}
				result = deepClone(object);
				if (object.attr && object.attr.icon && object.attr.icon.url) {
					result.attr.icon.url = predicate(object.attr.icon.url);
				}
				if (object.ideas) {
					result.ideas = {};
					_.each(object.ideas, function (v, k) {
						result.ideas[k] = processResources(v, predicate);
					});
				}
				return result;
			};
	self.get = function (skipResourceTranslation) {
		if (skipResourceTranslation) {
			return storage.getItem(key);
		}
		return processResources(storage.getItem(key), resourceManager.storeResource);
	};
	self.put = function (c) {
		try {
			storage.setItem(key, processResources(c, resourceManager.getResource));
		} catch (e) {
			alertController.show('Clipboard error', 'Insufficient space to copy object - saving the map might help up free up space', 'error');
		}
	};
};
jQuery.fn.newFromClipboardWidget = function (clipboard, mapController, resourceCompressor) {
	'use strict';
	var elements = jQuery(this);
	elements.click(function () {
		var map = clipboard.get(true),
			content;
		if (!map) {
			return;
		}
		if (_.isArray(map) && map.length > 1) {
			content = MAPJS.content(JSON.parse(JSON.stringify(MM.Maps.default)));
			content.pasteMultiple(1, map);
		} else {
			if (_.isArray(map)) {
				map = map[0];
			}
			if (map.attr && map.attr.style) {
				map.attr.style = undefined;
			}
			content = MAPJS.content(map);
		}
		resourceCompressor.compress(content);
		mapController.setMap(content);
	});
	return elements;
};

/*global $, _ */
$.fn.localStorageOpenWidget = function (offlineMapStorage, mapController) {
	'use strict';
	var modal = this,
		template = this.find('[data-mm-role=template]'),
		parent = template.parent(),
		statusDiv = this.find('[data-mm-role=status]'),
		showAlert = function (message, type, prompt, callback) {
			type = type || 'block';
			var html = '<div class="alert fade-in alert-' + type + '">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'<strong>' + message + '</strong>';
			if (callback && prompt) {
				html = html + '&nbsp;<a href="#" data-mm-role="auth">' + prompt + '</a>';
			}
			html = html + '</div>';
			statusDiv.html(html);
			$('[data-mm-role=auth]').click(function () {
				statusDiv.empty();
				callback();
			});
		},
		restoreMap = function (mapId, map, mapInfo) {
			offlineMapStorage.restore(mapId, map, mapInfo);
			fileRetrieval();
		},
		deleteMap = function (mapId, mapInfo, title) {
			var map = offlineMapStorage.load(mapId);
			offlineMapStorage.remove(mapId);
			fileRetrieval();
			showAlert('Map "' + title + '" removed.', 'info', 'Undo', restoreMap.bind(undefined, mapId, map, mapInfo));
		},
		loaded = function (fileMap) {
			statusDiv.empty();
			var sorted = [];
			_.each(fileMap, function (value, key) {
				sorted.push({id: key, title: value.d || 'map', modifiedDate: value.t * 1000, info: value});
			});
			sorted = _.sortBy(sorted, function (file) {
				return file && file.modifiedDate;
			}).reverse();
			if (sorted && sorted.length > 0) {
				_.each(sorted, function (file) {
					var added;
					if (file) {
						added = template.clone().appendTo(parent);
						added.find('a[data-mm-role=file-link]')
							.text(file.title)
							.click(function () {
								modal.modal('hide');
								mapController.loadMap(file.id);
							});
						added.find('[data-mm-role=modification-status]').text(new Date(file.modifiedDate).toLocaleString());
						added.find('[data-mm-role=map-delete]').click(deleteMap.bind(undefined, file.id, file.info, file.title));
					}
				});
			} else {
				$('<tr><td colspan="3">No maps found in Browser storage</td></tr>').appendTo(parent);
			}
		},
		fileRetrieval = function () {
			parent.empty();
			statusDiv.html('<i class="icon-spinner icon-spin"/> Retrieving files...');
			try {
				loaded(offlineMapStorage.list());
			} catch (e) {
				showAlert('Unable to retrieve files from browser storage', 'error');
			}
		};
	template.detach();
	modal.on('show', function () {
		fileRetrieval();
	});
	return modal;
};

/*global jQuery, MM, observable, XMLHttpRequest*/
MM.MapController = function (initialMapSources) {
	// order of mapSources is important, the first mapSource is default
	'use strict';
	observable(this);
	var self = this,
		dispatchEvent = this.dispatchEvent,
		mapLoadingConfirmationRequired,
		mapInfo = {},
		activeMapSource,
		mapSources = [].concat(initialMapSources),
		lastProperties,
		chooseMapSource = function (identifier) {
			// order of identifiers is important, the first identifier takes precedence
			var mapSourceIndex;
			for (mapSourceIndex = 0; mapSourceIndex < mapSources.length; mapSourceIndex++) {
				if (mapSources[mapSourceIndex].recognises(identifier)) {
					return mapSources[mapSourceIndex];
				}
			}
		},
		mapLoaded = function (idea, mapId, properties) {
			lastProperties = properties;
			mapLoadingConfirmationRequired = false;
			properties = properties || {};
			if (!properties.autoSave) {
				idea.addEventListener('changed', function () {
					mapLoadingConfirmationRequired = true;
				});
			}
			mapInfo = {
				idea: idea,
				mapId: properties.editable && mapId
			};
			dispatchEvent('mapLoaded', mapId, idea, properties);
		};
	self.addMapSource = function (mapSource) {
		mapSources.push(mapSource);
	};
	self.validMapSourcePrefixesForSaving = 'abgp';
	self.setMap = mapLoaded;
	self.isMapLoadingConfirmationRequired = function () {
		return mapLoadingConfirmationRequired;
	};

	self.currentMapId = function () {
		return mapInfo && mapInfo.mapId;
	};

	self.loadMap = function (mapId, force) {
		var progressEvent = function (evt) {
				var done = (evt && evt.loaded) || 0,
					total = (evt && evt.total) || 1,
					message = ((evt && evt.loaded) ? Math.round(100 * done / total) + '%' : evt);
				dispatchEvent('mapLoading', mapId, message);
			},
			mapLoadFailed = function (reason, label) {
				var retryWithDialog = function () {
					dispatchEvent('mapLoading', mapId);
					activeMapSource.loadMap(mapId, true).then(mapLoaded, mapLoadFailed, progressEvent);
				}, mapSourceName = activeMapSource.description ? ' [' + activeMapSource.description + ']' : '';
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapLoadingUnAuthorized', mapId, reason);
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', activeMapSource.description, retryWithDialog);
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', activeMapSource.description, retryWithDialog);
				} else if (reason === 'map-load-redirect') {
					self.loadMap(label, force);
				} else if (reason === 'user-cancel') {
					dispatchEvent('mapLoadingCancelled');
				} else {
					label = label ? label + mapSourceName : mapSourceName;
					dispatchEvent('mapLoadingFailed', mapId, reason, label);
				}
			};

		if (mapId === this.currentMapId() && !force) {
			dispatchEvent('mapLoadingCancelled', mapId);
			return;
		}
		if (!force && mapLoadingConfirmationRequired) {
			dispatchEvent('mapLoadingConfirmationRequired', mapId);
			return;
		}
		activeMapSource = chooseMapSource(mapId);
		if (!activeMapSource) {
			dispatchEvent('mapIdNotRecognised', mapId);
			return;
		}
		dispatchEvent('mapLoading', mapId);
		activeMapSource.loadMap(mapId).then(
			mapLoaded,
			mapLoadFailed,
			progressEvent
		);
	};
	this.publishMap = function (mapSourceType, forceNew) {
		var mapSaved = function (savedMapId, properties) {
				var previousWasReloadOnSave = lastProperties && lastProperties.reloadOnSave;
				properties = properties || {};
				lastProperties = properties;
				mapLoadingConfirmationRequired = false;
				mapInfo.mapId = savedMapId;
				dispatchEvent('mapSaved', savedMapId, mapInfo.idea, properties);
				if (previousWasReloadOnSave || properties.reloadOnSave) {
					self.loadMap(savedMapId, true);
				}
			},
			progressEvent = function (evt) {
				var done = (evt && evt.loaded) || 0,
					total = (evt && evt.total) || 1,
					message = ((evt && evt.loaded) ? Math.round(100 * done / total) + '%' : evt);
				dispatchEvent('mapSaving', activeMapSource.description, message);
			},
			mapSaveFailed = function (reason, label) {
				var retryWithDialog = function () {
					dispatchEvent('mapSaving', activeMapSource.description);
					activeMapSource.saveMap(mapInfo.idea, mapInfo.mapId, true).then(mapSaved, mapSaveFailed, progressEvent);
				}, mapSourceName = activeMapSource.description || '';
				label = label ? label + mapSourceName : mapSourceName;
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapSavingUnAuthorized', function () {
						dispatchEvent('mapSaving', activeMapSource.description, 'Creating a new file');
						activeMapSource.saveMap(mapInfo.idea, 'new', true).then(mapSaved, mapSaveFailed, progressEvent);
					});
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', label, retryWithDialog);
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', label, retryWithDialog);
				} else if (reason === 'file-too-large') {
					dispatchEvent('mapSavingTooLarge', activeMapSource.description);
				} else if (reason === 'user-cancel') {
					dispatchEvent('mapSavingCancelled');
				} else {
					dispatchEvent('mapSavingFailed', reason, label);
				}
			},
			saveAsId = forceNew ? '' : mapInfo.mapId;
		activeMapSource = chooseMapSource(mapSourceType || mapInfo.mapId);
		dispatchEvent('mapSaving', activeMapSource.description);
		activeMapSource.saveMap(mapInfo.idea, saveAsId).then(
			mapSaved,
			mapSaveFailed,
			progressEvent
		);
	};
};
MM.MapController.activityTracking = function (mapController, activityLog) {
	'use strict';
	var startedFromNew = function (idea) {
			return idea.id === 1;
		},
		isNodeRelevant = function (ideaNode) {
			return ideaNode.title && ideaNode.title.search(/MindMup|Lancelot|cunning|brilliant|Press Space|famous|Luke|daddy/) === -1;
		},
		isNodeIrrelevant = function (ideaNode) {
			return !isNodeRelevant(ideaNode);
		},
		isMapRelevant = function (idea) {
			return startedFromNew(idea) && idea.find(isNodeRelevant).length > 5 && idea.find(isNodeIrrelevant).length < 3;
		},
		wasRelevantOnLoad,
		changed = false,
		oldIdea;
	mapController.addEventListener('mapLoaded', function (mapId, idea) {
		activityLog.log('Map', 'View', mapId);
		wasRelevantOnLoad = isMapRelevant(idea);
		if (oldIdea !== idea) {
			oldIdea = idea;
			idea.addEventListener('changed', function (command, args) {
				if (!changed) {
					changed = true;
					activityLog.log('Map', 'Edit');
				}
				activityLog.log(['Map', command].concat(args));
			});
		}
	});
	mapController.addEventListener('mapLoadingFailed', function (mapUrl, reason, label) {
		var message = 'Error loading map document [' + mapUrl + '] ' + JSON.stringify(reason);
		if (label) {
			message = message + ' label [' + label + ']';
		}
		activityLog.error(message);
	});
	mapController.addEventListener('mapSaving', activityLog.log.bind(activityLog, 'Map', 'Save Attempted'));
	mapController.addEventListener('mapSaved', function (id, idea) {
		changed = false;
		if (isMapRelevant(idea) && !wasRelevantOnLoad) {
			activityLog.log('Map', 'Created Relevant', id);
		} else if (wasRelevantOnLoad) {
			activityLog.log('Map', 'Saved Relevant', id);
		} else {
			activityLog.log('Map', 'Saved Irrelevant', id);
		}
	});
	mapController.addEventListener('mapSavingFailed', function (reason, repositoryName) {
		activityLog.error('Map save failed (' + repositoryName + ')' + JSON.stringify(reason));
	});
	mapController.addEventListener('networkError', function (reason) {
		activityLog.log('Map', 'networkError', JSON.stringify(reason));
	});
};

MM.MapController.alerts = function (mapController, alert, modalConfirmation) {
	'use strict';
	var alertId,
		googleLoadedAlertId,
		showAlertWithCallBack = function (message, prompt, callback, cancel) {
			alert.hide(alertId);
			modalConfirmation.showModalToConfirm('Please confirm', message, prompt).then(callback, cancel);
		},
		showErrorAlert = function (title, message) {
			alert.hide(alertId);
			alertId = alert.show(title, message, 'error');
		};

	mapController.addEventListener('mapLoadingConfirmationRequired', function (newMapId) {
		var isNew = /^new/.test(newMapId);
		showAlertWithCallBack(
			'There are unsaved changes in the current map. Please confirm that you would like to ' + (isNew ? 'create a new map' : 'load a different map.'),
			(isNew ? 'Create New' : 'Load anyway'),
			function () {
				mapController.loadMap(newMapId, true);
			}
		);
	});
	mapController.addEventListener('mapLoading', function (mapUrl, progressMessage) {
		alert.hide(alertId);
		alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Please wait, loading the map...', (progressMessage || ''));
	});
	mapController.addEventListener('mapSaving', function (repositoryName, progressMessage) {
		alert.hide(alertId);
		alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Please wait, saving the map...', (progressMessage || ''));
	});
	mapController.addEventListener('authRequired', function (providerName, authCallback) {
		showAlertWithCallBack(
			'This operation requires authentication through ' + providerName + ', an external storage provider. ' +
				'Please click on Authenticate below to go to the external provider and allow MindMup to access your account. ' +
				'You can learn more about authentication requirements on our <a href="http://blog.mindmup.com/p/storage-options.html" target="_blank">Storage Options</a> page.',
			'Authenticate',
			authCallback
		);
	});
	mapController.addEventListener('mapSaved mapLoaded', function () {
		alert.hide(alertId);
	});
	mapController.addEventListener('authorisationFailed', function (providerName, authCallback) {
		showAlertWithCallBack(
			'The operation was rejected by ' + providerName + ' storage. Click on Reauthenticate to try using different credentials or license.',
			'Reauthenticate',
			authCallback
		);
	});
	mapController.addEventListener('mapLoadingUnAuthorized', function () {
		showErrorAlert('The map could not be loaded.', 'You do not have the right to view this map. <a target="_blank" href="http://blog.mindmup.com/p/how-to-resolve-common-networking.html">Click here for some common solutions</a>');
	});
	mapController.addEventListener('mapSavingUnAuthorized', function (callback) {
		showAlertWithCallBack(
			'You do not have the right to edit this map',
			'Save a copy',
			callback
		);
	});
	mapController.addEventListener('mapLoadingFailed', function (mapId, reason, label) {
		showErrorAlert('Unfortunately, there was a problem loading the map.' + label, 'If you are not experiencing network problems, <a href="http://blog.mindmup.com/p/how-to-resolve-common-networking.html" target="blank">click here for some common ways to fix this</a>');
	});
	mapController.addEventListener('mapSavingCancelled mapLoadingCancelled', function () {
		alert.hide(alertId);
	});
	mapController.addEventListener('mapSavingTooLarge', function (mapSourceDescription) {
		if (mapSourceDescription === 'S3_CORS') {
			showAlertWithCallBack('The map is too large for anonymous MindMup storage. Maps larger than 100 KB can only be stored to MindMup Gold, or a third-party cloud storage. (<a href="http://blog.mindmup.com/p/storage-options.html" target="_blank">more info on storage options</a>)', 'Save to MindMup Gold', function () {
				mapController.publishMap('b');
			}, function () {
				mapController.dispatchEvent('mapSavingCancelled');
			});
		} else {
			showErrorAlert('Unfortunately, the file is too large for the selected storage.', 'Please select a different storage provider from File -&gt; Save As menu');
		}
	});
	mapController.addEventListener('mapSavingFailed', function (reason, label, callback) {
		var messages = {
			'network-error': ['There was a network problem communicating with the server.', 'If you are not experiencing network problems, <a href="http://blog.mindmup.com/p/how-to-resolve-common-networking.html" target="blank">click here for some common ways to fix this</a>. Don\'t worry, you have an auto-saved version in this browser profile that will be loaded the next time you open the map']
		},
			message = messages[reason] || ['Unfortunately, there was a problem saving the map.', 'Please try again later. We have sent an error report and we will look into this as soon as possible'];
		if (callback) {
			showAlertWithCallBack(message[0], message[1], callback);
		} else {
			showErrorAlert(message[0], message[1]);
		}
	});

	mapController.addEventListener('mapLoading mapSaving', function () {
		alert.hide(googleLoadedAlertId);
		googleLoadedAlertId = 0;
	});
	/*
	mapController.addEventListener('mapLoaded', function (mapId) {
		alert.hide(googleLoadedAlertId);
		if (mapId && mapId.indexOf('g1') === 0) {
			googleLoadedAlertId = alert.show('Upgrade to MindMup 2.0: ', 'Try out <a href="https://drive.mindmup.com">MindMup 2.0</a> for much better Google Drive integration. (<a target="_blank" href="https://youtube.com/watch?v=--v7ZfTHNJ8&feature=youtu.be">More info</a>)', 'success');
		}
	});*/
};
(function () {
	'use strict';
	var oldXHR = jQuery.ajaxSettings.xhr.bind(jQuery.ajaxSettings);
	jQuery.ajaxSettings.xhr = function () {
		var xhr = oldXHR();
		if (xhr instanceof XMLHttpRequest) {
			xhr.addEventListener('progress', this.progress, false);
		}
		if (xhr.upload) {
			xhr.upload.addEventListener('progress', this.progress, false);
		}
		return xhr;
	};
}());

/*global jQuery, window, _*/
jQuery.fn.mapStatusWidget = function (mapController, activeContentListener) {
	'use strict';
	var element = this,
		autoSave;
	mapController.addEventListener('mapSaved mapLoaded', function (mapId, idea, properties) {
		if (!properties.editable) { /* imported, no repository ID */
			jQuery('body').removeClass('map-unchanged').addClass('map-changed');
		} else {
			element.removeClass('map-changed').addClass('map-unchanged');
		}
		autoSave = properties.autoSave;
		element.removeClass(_.filter(element.attr('class').split(' '), function (css) {
			return (/^map-source-/).test(css);
		}).join(' '));
		if (mapId) {
			element.addClass('map-source-' + mapId[0]);
		}
	});
	jQuery(window).bind('beforeunload', function () {
		if (mapController.isMapLoadingConfirmationRequired()) {
			return 'There are unsaved changes.';
		}
	});
	activeContentListener.addListener(function (content, isNew) {
		if (!autoSave && !isNew) {
			if (element.hasClass('map-unchanged')) {
				element.removeClass('map-unchanged').addClass('map-changed');
			}
		}
	});
};

/*global MM, jQuery, MAPJS, _*/
MM.Maps = {};
MM.Maps['default'] = MM.Maps['new'] = {'title': 'Press Space or double-click to edit', 'id': 1};

MM.EmbeddedMapSource = function (newMapProperties) {
	'use strict';
	var properties = newMapProperties ||  {editable: true};
	this.recognises = function (mapId) {
		if ((/^new-/).test(mapId)) {
			mapId = 'new';
		}
		return MM.Maps[mapId];
	};
	this.loadMap = function (mapId) {
		return jQuery.Deferred().resolve(MAPJS.content(_.clone(this.recognises(mapId))), mapId, properties).promise();
	};
};

/*global MM, _, observable*/
MM.MeasuresModel = function (configAttributeName, valueAttrName, activeContentListener, defaultFilter) {
	'use strict';
	var self = observable(this),
		measures = [],
		latestMeasurementValues = [],
		filter,
		onActiveContentChange = function (activeContent, isNew) {
			if (isNew) {
				self.dispatchEvent('startFromScratch');
			}
			var measuresBefore = measures;
			measures = getActiveContentMeasures();
			if (self.listeners('measureRemoved').length > 0) {
				_.each(_.difference(measuresBefore, measures), function (measure) {
					self.dispatchEvent('measureRemoved', measure);
				});
			}
			if (self.listeners('measureAdded').length > 0) {
				_.each(_.difference(measures, measuresBefore), function (measure) {
					self.dispatchEvent('measureAdded', measure, measures.indexOf(measure));
				});
			}
			dispatchMeasurementChangedEvents();
		},
		onFilterChanged = function () {
			self.dispatchEvent('measureRowsChanged');
		},
		getActiveContentMeasures = function () {
			var activeContent = activeContentListener.getActiveContent(),
				value = activeContent && activeContent.getAttr(configAttributeName);
			if (!_.isArray(value)) {
				return [];
			}
			return value;
		},
		mapMeasurements = function (measurements) {
			var map = {};
			_.each(measurements, function (measurement) {
				map[measurement.id] = measurement;
			});
			return map;
		},
		measurementValueDifferences = function (measurement, baseline) {
			var difference = [];
			_.each(measurement.values, function (value, key) {
				var baselineValue = (baseline && baseline.values && baseline.values[key]) || 0;
				if (value !== baselineValue) {
					difference.push(['measureValueChanged', measurement.id, key, value || 0]);
				}
			});
			if (baseline) {
				_.each(baseline.values, function (value, key) {
					var noNewValue = !measurement || !measurement.values || !measurement.values[key];
					if (noNewValue) {
						difference.push(['measureValueChanged', baseline.id, key, 0]);
					}
				});
			}
			return difference;
		},
		measurementDifferences = function (measurements, baslineMeasurements) {
			/*{id: 11, title: 'with values', values: {'Speed': 1, 'Efficiency': 2}}*/
			var baslineMeasurementsMap = mapMeasurements(baslineMeasurements),
				differences = [];
			_.each(measurements, function (measurement) {
				var baseline = baslineMeasurementsMap[measurement.id];
				differences = differences.concat(measurementValueDifferences(measurement, baseline));
			});
			return differences;
		},
		dispatchMeasurementChangedEvents = function () {
			if (self.listeners('measureValueChanged').length === 0) {
				return;
			}
			var oldMeasurementValues = latestMeasurementValues,
				differences = measurementDifferences(self.getMeasurementValues(), oldMeasurementValues);
			_.each(differences, function (changeArgs) {
				self.dispatchEvent.apply(self, changeArgs);
			});
		};

	self.editingMeasure = function (isEditing, nodeId) {

		self.dispatchEvent('measureEditing', isEditing, nodeId);
	};
	self.getMeasures = function () {
		return measures.slice(0);
	};
	self.editWithFilter = function (newFilter) {
		if (filter) {
			self.removeFilter();
		}
		filter = newFilter;
		if (filter && filter.addEventListener) {
			filter.addEventListener('filteredRowsChanged', onFilterChanged);
		}
	};
	self.addUpMeasurementForAllNodes = function (measurementName) {
		var activeContent = activeContentListener.getActiveContent(),
			result = {},
			addUpMeasure = function (idea) {
				var measures = idea.getAttr(valueAttrName), sum = 0, hasValue = false;
				if (measures && measures[measurementName]) {
					sum = parseFloat(measures[measurementName]);
					hasValue = true;
				}
				if (idea.ideas) {
					_.each(idea.ideas, function (subIdea) {
						if (result[subIdea.id] !== undefined) {
							hasValue = true;
							sum += result[subIdea.id];
						}
					});
				}
				if (hasValue) {
					result[idea.id] = sum;
				}
			};

		if (!activeContent || !measurementName) {
			return {};
		}
		activeContent.traverse(addUpMeasure, true);
		return result;
	};
	self.getMeasurementValues = function () {
		var activeContent = activeContentListener.getActiveContent(),
			result = [];
		if (!activeContent) {
			return result;
		}
		activeContent.traverse(function (idea) {
			if (!filter || filter.predicate(idea)) {
				var newVals = {};
				_.each(_.extend({}, idea.getAttr(valueAttrName)), function (val, key) {
					if (val === undefined) {
						return;
					}
					if (!isNaN(parseFloat(val))) {
						newVals[key] = val;
					}
				});
				result.push({
					id: idea.id,
					title: idea.title,
					values: newVals
				});
			}
		});
		latestMeasurementValues = result.slice(0);
		return result;
	};
	self.addMeasure = function (measureName) {
		if (!measureName || measureName.trim() === '') {
			return false;
		}
		measureName = measureName.trim();

		if (_.find(measures, function (measure) {
			return measure.toUpperCase() === measureName.toUpperCase();
		})) {
			return false;
		}
		var activeContent = activeContentListener.getActiveContent();
		activeContent.updateAttr(activeContent.id, configAttributeName, measures.concat([measureName]));
	};
	self.removeMeasure = function (measureName) {
		if (!measureName || measureName.trim() === '') {
			return false;
		}
		var updated = _.without(measures, measureName),
			activeContent;
		if (_.isEqual(updated, measures)) {
			return;
		}
		activeContent = activeContentListener.getActiveContent();
		activeContent.startBatch();
		activeContent.updateAttr(activeContent.id, configAttributeName, updated);
		activeContent.traverse(function (idea) {
			activeContent.mergeAttrProperty(idea.id, valueAttrName, measureName,  false);
		});
		activeContent.endBatch();
	};
	self.validate = function (value) {
		return !isNaN(parseFloat(value)) && isFinite(value);
	};
	self.setValue = function (nodeId, measureName, value) {
		if (!self.validate(value)) {
			return false;
		}
		return activeContentListener.getActiveContent().mergeAttrProperty(nodeId, valueAttrName, measureName, value);
	};
	self.getRawData = function (ignoreFilter) {
		var activeContent = activeContentListener.getActiveContent(),
			data = [];
		if (!activeContent) {
			return data;
		}
		data.push(['Name'].concat(measures));
		activeContent.traverse(function (idea) {
			if (ignoreFilter || !filter || filter.predicate(idea)) {
				data.push(
					[idea.title].concat(_.map(measures,
							function (measure) {
								var ideaMeasures = idea.getAttr(valueAttrName) || {},
									floatVal = ideaMeasures[measure] && parseFloat(ideaMeasures[measure]);
								if (floatVal !== undefined && !isNaN(floatVal)) {
									return floatVal;
								}
							})
						)
				);
			}
		});

		return data;
	};
	self.removeFilter = function () {
		if (filter && filter.cleanup) {
			filter.cleanup();
		}
		if (filter && filter.removeEventListener) {
			filter.removeEventListener('filteredRowsChanged', onFilterChanged);
		}
		filter = undefined;
	};
	activeContentListener.addListener(onActiveContentChange);
	self.editWithFilter(defaultFilter);
};
MM.MeasuresModel.filterByIds = function (ids) {
	'use strict';
	return {
		predicate: function (idea) {
			return _.include(ids, idea.id);
		}
	};
};

MM.MeasuresModel.ActivatedNodesFilter = function (mapModel) {
	'use strict';
	var self = observable(this),
		ids = mapModel.getActivatedNodeIds(),
		onFilteredResultsChange = function (force) {
			var newIds = mapModel.getActivatedNodeIds();
			if (force || ids !== newIds) {
				ids = newIds;
				self.dispatchEvent('filteredRowsChanged');
			}
		},
		onFilteredResultsChangeForced = onFilteredResultsChange.bind(self, true);
	mapModel.addEventListener('activatedNodesChanged', onFilteredResultsChange);
	mapModel.addEventListener('nodeTitleChanged', onFilteredResultsChangeForced);
	self.predicate = function (idea) {
		return _.include(ids, idea.id);
	};
	self.cleanup = function () {
		mapModel.removeEventListener('activatedNodesChanged', onFilteredResultsChange);
		mapModel.removeEventListener('nodeTitleChanged', onFilteredResultsChangeForced);
	};
};


MM.measuresModelMediator = function (mapModel, measuresModel) {
	'use strict';
	measuresModel.addEventListener('measureEditing', function (isEditing, nodeId) {
		if (isEditing && nodeId) {
			mapModel.selectNode(nodeId, true, true);
		}
		mapModel.setInputEnabled(!isEditing, true);
	});
};

/*global jQuery, _*/
jQuery.fn.addToRowAtIndex = function (container, index) {
	'use strict';
	var element = jQuery(this),
		current = container.children('[data-mm-role=' + element.data('mm-role') + ']').eq(index);
	if (current.length) {
		element.insertBefore(current);
	} else {
		element.appendTo(container);
	}
	return element;
};

jQuery.fn.numericTotaliser = function () {
	'use strict';
	var element = jQuery(this),
		footer = element.find('tfoot tr'),
		recalculateColumn = function (column) {
			var total = 0;
			if (column === 0) {
				return;
			}
			element.find('tbody tr').each(function () {
				var row = jQuery(this),
					val = parseFloat(row.children().eq(column).text());
				if (!isNaN(val)) {
					total += val;
				}
			});
			footer.children().eq(column).text(total);
		},
		initialTotal = function () {
			var column;
			for (column = 1; column < footer.children().size(); column++) {
				recalculateColumn(column);
			}
		};
	element.on('change', function (evt /*, newValue*/) {
		var target = jQuery(evt.target);
		if (evt.column !== undefined) {
			recalculateColumn(evt.column);
		} else if (target.is('td')) {
			recalculateColumn(target.index());
		} else {
			initialTotal();
		}
	});
	return this;
};

jQuery.fn.measuresDisplayControlWidget = function (measuresModel, mapModel) {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			measurementActivationTemplate = element.find('[data-mm-role=measurement-activation-template]'),
			measurementActivationContainer = measurementActivationTemplate.parent(),
			hideLabels = element.find('[data-mm-role=hide-measure]'),
			onMeasureAdded = function (measureName /*, index */) {
				var measurementActivation = measurementActivationTemplate.clone().appendTo(measurementActivationContainer);
				measurementActivation.attr('data-mm-measure', measureName).find('[data-mm-role=show-measure]').click(function () {
					measuresModel.dispatchEvent('measureLabelShown', measureName);
					mapModel.setLabelGenerator(function () {
						return measuresModel.addUpMeasurementForAllNodes(measureName);
					});
				}).find('[data-mm-role=measure-name]').text(measureName);
				element.show();
			},
			onMeasureRemoved = function (measureName) {
				measurementActivationContainer.children('[data-mm-measure="' + measureName.replace('"', '\\"') + '"]').remove();
				if (_.isEmpty(measuresModel.getMeasures())) {
					element.hide();
				}
			},
			clean = function () {
				measurementActivationContainer.children('[data-mm-role=measurement-activation-template]').remove();
				var measures = measuresModel.getMeasures();
				if (measures && measures.length > 0) {
					_.each(measures, onMeasureAdded);
				} else {
					element.hide();
				}
			},
			onMeasureLabelShown = function (measureName) {
				measurementActivationContainer.children().removeClass('mm-active').filter('[data-mm-measure="' + measureName.replace('"', '\\"') + '"]').addClass('mm-active');
				if (measureName) {
					hideLabels.show();
				} else {
					hideLabels.hide();
				}
			};
		clean();

		measuresModel.addEventListener('startFromScratch', clean);
		measuresModel.addEventListener('measureAdded', onMeasureAdded);
		measuresModel.addEventListener('measureRemoved', onMeasureRemoved);
		measuresModel.addEventListener('measureLabelShown', onMeasureLabelShown);
		hideLabels.hide().click(function () {
			mapModel.setLabelGenerator(false);
			measuresModel.dispatchEvent('measureLabelShown', '');
		});
	});
};
jQuery.fn.measuresSheetWidget = function (measuresModel) {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			measurementsTable = element.find('[data-mm-role=measurements-table]'),
			noMeasuresDiv = element.find('[data-mm-role=no-measures]'),
			measurementTemplate = element.find('[data-mm-role=measurement-template]'),
			measurementContainer = measurementTemplate.parent(),
			ideaTemplate = element.find('[data-mm-role=idea-template]'),
			valueTemplate = ideaTemplate.find('[data-mm-role=value-template]').detach(),
			ideaContainer = ideaTemplate.parent(),
			addMeasureInput = element.find('[data-mm-role=measure-to-add]'),
			summaryTemplate = element.find('[data-mm-role=summary-template]'),
			summaryContainer = summaryTemplate.parent(),
			getRowForNodeId = function (nodeId) {
				return element.find('[data-mm-nodeid="' + nodeId + '"]');
			},
			getColumnIndexForMeasure = function (measureName) {
				return _.map(measurementContainer.children(), function (column) {
					return jQuery(column).find('[data-mm-role=measurement-name]').text();
				}).indexOf(measureName);
			},
			appendMeasure = function (measureName, index) {
				var measurement = measurementTemplate.clone().addToRowAtIndex(measurementContainer, index);
				measurement.find('[data-mm-role=measurement-name]').text(measureName);
				measurement.find('[data-mm-role=remove-measure]').click(function () {
					measuresModel.removeMeasure(measureName);
				});
				summaryTemplate.clone().addToRowAtIndex(summaryContainer, index).text('0');
				measurementsTable.show();
				noMeasuresDiv.hide();
			},
			onFocused = function (nowFocused, nodeId) {
				if (nowFocused !== focused) {
					focused = nowFocused;
					measuresModel.editingMeasure(nowFocused, nodeId);
				}
			},
			appendMeasureValue = function (container, value, nodeId, measureName, index) {
				var current = container.children('[data-mm-role=value-template]').eq(index),
					valueCell = valueTemplate.clone();
				valueCell.text(value || '0')
				.on('change', function (evt, newValue) {
					return measuresModel.setValue(nodeId, measureName, newValue);
				}).on('focus', function () {
					onFocused(true, nodeId);
				}).on('blur', function () {
					onFocused(false, nodeId);
				}).keydown('Esc', function (e) {
					valueCell.blur();
					e.preventDefault();
					e.stopPropagation();
				});

				if (current.length) {
					valueCell.insertBefore(current);
				} else {
					valueCell.appendTo(container);
				}
				return valueCell;
			},
			onMeasureValueChanged = function (nodeId, measureChanged, newValue) {
				var row = getRowForNodeId(nodeId),
					col = getColumnIndexForMeasure(measureChanged);
				if (col >= 0) {
					row.children().eq(col).text(newValue);
					measurementsTable.trigger(jQuery.Event('change', {'column': col}));
				}
			},
			onMeasureAdded = function (measureName, index) {
				appendMeasure(measureName, index);
				_.each(ideaContainer.children(), function (idea) {
					appendMeasureValue(jQuery(idea), '0', jQuery(idea).data('mm-nodeid'), measureName, index);
				});
			},
			onMeasureLabelShown = function (measureName) {
				measurementContainer.children().removeClass('mm-active');
				var col = getColumnIndexForMeasure(measureName);
				if (col >= 0) {
					measurementContainer.children().eq(col).addClass('mm-active');
				}
			},
			onMeasureRemoved = function (measureName) {
				var col = getColumnIndexForMeasure(measureName);
				if (col < 0) {
					return;
				}
				measurementContainer.children().eq(col).remove();
				summaryContainer.children().eq(col).remove();
				_.each(ideaContainer.children(), function (idea) {
					jQuery(idea).children().eq(col).remove();
				});
			},
			buildMeasureTable = function () {
				measurementContainer.children('[data-mm-role=measurement-template]').remove();
				summaryContainer.children('[data-mm-role=summary-template]').remove();
				var measures = measuresModel.getMeasures();
				if (measures && measures.length > 0) {
					measurementsTable.show();
					noMeasuresDiv.hide();
				} else {
					measurementsTable.hide();
					noMeasuresDiv.show();
				}
				_.each(measures, function (m) {
					appendMeasure(m);
				});
				buildMeasureRows(measures);
			},
			focused = false,
			buildMeasureRows = function (measures) {
				ideaContainer.children('[data-mm-role=idea-template]').remove();
				_.each(measuresModel.getMeasurementValues(), function (mv) {
					var newIdea = ideaTemplate.clone().appendTo(ideaContainer).attr('data-mm-nodeid', mv.id);
					newIdea.find('[data-mm-role=idea-title]').text(function () {
						var truncLength = jQuery(this).data('mm-truncate');
						if (truncLength && mv.title.length > truncLength) {
							return mv.title.substring(0, truncLength) + '...';
						}
						return mv.title;
					});
					_.each(measures, function (measure) {
						appendMeasureValue(newIdea, mv.values[measure], mv.id, measure);
					});
				});
				element.find('[data-mm-role=measurements-table]').trigger('change');
			},
			onMeasureRowsChanged = function () {
				buildMeasureRows(measuresModel.getMeasures());
			};


		measurementTemplate.detach();
		summaryTemplate.detach();
		ideaTemplate.detach();
		measurementsTable.editableTableWidget({
			editor: element.find('[data-mm-role=measures-editor]'),
			cloneProperties: jQuery.fn.editableTableWidget.defaultOptions.cloneProperties.concat(['outline', 'box-shadow', '-webkit-box-shadow', '-moz-box-shadow'])
		}).on('validate', function (evt, value) {
			measuresModel.editingMeasure(true);
			return measuresModel.validate(value);
		}).numericTotaliser();
		element.find('[data-mm-role=measures-editor]').on('focus', onFocused.bind(element, true, false)).on('blur', onFocused.bind(element, false, false));
		element.on('show', function () {
			buildMeasureTable();
			measuresModel.addEventListener('startFromScratch', buildMeasureTable);
			measuresModel.addEventListener('measureRowsChanged', onMeasureRowsChanged);
			measuresModel.addEventListener('measureValueChanged', onMeasureValueChanged);
			measuresModel.addEventListener('measureAdded', onMeasureAdded);
			measuresModel.addEventListener('measureRemoved', onMeasureRemoved);
		});
		element.on('hide', function () {
			measuresModel.removeEventListener('startFromScratch', buildMeasureTable);
			measuresModel.removeEventListener('measureRowsChanged', onMeasureRowsChanged);
			measuresModel.removeEventListener('measureValueChanged', onMeasureValueChanged);
			measuresModel.removeEventListener('measureAdded', onMeasureAdded);
			measuresModel.removeEventListener('measureRemoved', onMeasureRemoved);
			element.parent().siblings('[tabindex]').focus();
		});
		element.find('[data-mm-role=measure-to-add]').parent('form').on('submit', function () {
			measuresModel.addMeasure(addMeasureInput.val());
			addMeasureInput.val('');
			return false;
		});
		measuresModel.addEventListener('measureLabelShown', onMeasureLabelShown);
	});

};

/*global $, window*/
$.fn.editableTableWidget = function (options) {
	'use strict';
	return $(this).each(function () {
		var activeOptions = $.extend($.fn.editableTableWidget.defaultOptions, options),
			ARROW_LEFT = 37, ARROW_UP = 38, ARROW_RIGHT = 39, ARROW_DOWN = 40, ENTER = 13, ESC = 27, TAB = 9,
			element = $(this),
			editor = activeOptions.editor.css('position', 'absolute').hide().appendTo(element.parent()),
			active,
			showEditor = function (select) {
				active = element.find('td:focus');
				if (active.length) {
					editor.val(active.text())
						.removeClass('error')
						.show()
						.offset(active.offset())
						.css(active.css(activeOptions.cloneProperties))
						.width(active.width())
						.height(active.height())
						.focus();
					if (select) {
						editor.select();
					}
				}
			},
			setActiveText = function () {
				var text = editor.val(),
					evt = $.Event('change'),
					originalContent;
				if (active.text() === text || editor.hasClass('error')) {
					return true;
				}
				originalContent = active.html();
				active.text(text).trigger(evt, text);
				if (evt.result === false) {
					active.html(originalContent);
				}
			},
			movement = function (element, keycode) {
				if (keycode === ARROW_RIGHT) {
					return element.next('td');
				} else if (keycode === ARROW_LEFT) {
					return element.prev('td');
				} else if (keycode === ARROW_UP) {
					return element.parent().prev().children().eq(element.index());
				} else if (keycode === ARROW_DOWN) {
					return element.parent().next().children().eq(element.index());
				}
				return [];
			};
		editor.blur(function () {
			setActiveText();
			editor.hide();
		}).keydown(function (e) {
			if (e.which === ENTER) {
				setActiveText();
				editor.hide();
				active.focus();
				e.preventDefault();
				e.stopPropagation();
			} else if (e.which === ESC) {
				editor.val(active.text());
				e.preventDefault();
				e.stopPropagation();
				editor.hide();
				active.focus();
			} else if (e.which === TAB) {
				active.focus();
			} else if (this.selectionEnd - this.selectionStart === this.value.length) {
				var possibleMove = movement(active, e.which);
				if (possibleMove.length > 0) {
					possibleMove.focus();
					e.preventDefault();
					e.stopPropagation();
				}
			}
		})
		.on('input paste', function () {
			var evt = $.Event('validate');
			active.trigger(evt, editor.val());
			if (evt.result === false) {
				editor.addClass('error');
			} else {
				editor.removeClass('error');
			}
		});
		element.on('click keypress dblclick', showEditor)
		.css('cursor', 'pointer')
		.keydown(function (e) {
			var prevent = true,
				possibleMove = movement($(e.target), e.which);
			if (possibleMove.length > 0) {
				possibleMove.focus();
			} else if (e.which === ENTER) {
				showEditor(false);
			} else if (e.which === 17 || e.which === 91 || e.which === 93) {
				showEditor(true);
				prevent = false;
			} else {
				prevent = false;
			}
			if (prevent) {
				e.stopPropagation();
				e.preventDefault();
			}
		});

		element.find('td').prop('tabindex', 1);

		$(window).on('resize', function () {
			if (editor.is(':visible')) {
				editor.offset(active.offset())
				.width(active.width())
				.height(active.height());
			}
		});
	});

};
$.fn.editableTableWidget.defaultOptions =	{
	cloneProperties: ['padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
						'text-align', 'font', 'font-size', 'font-family', 'font-weight',
						'border', 'border-top', 'border-bottom', 'border-left', 'border-right'],
	editor: $('<input>')
};

/*global jQuery*/
jQuery.fn.modalConfirmWidget = function () {
	'use strict';
	var self = this,
		titleElement = self.find('[data-mm-role=title]'),
		explanationElement = self.find('[data-mm-role=explanation]'),
		confirmElement = self.find('[data-mm-role=confirm]'),
		currentDeferred,
		doConfirm = function () {
			if (currentDeferred) {
				currentDeferred.resolve();
				currentDeferred = undefined;
			}
		};
	self.modal({keyboard: true, show: false});
	confirmElement.click(function () {
		doConfirm();
	});
	confirmElement.keydown('space', function () {
		doConfirm();
		self.hide();
	});
	this.showModalToConfirm = function (title, explanation, confirmButtonCaption) {
		currentDeferred = jQuery.Deferred();
		titleElement.text(title);
		explanationElement.html(explanation);
		confirmElement.text(confirmButtonCaption);
		self.modal('show');
		return currentDeferred.promise();
	};
	this.on('shown', function () {
		confirmElement.focus();
	});
	this.on('hidden', function () {
		if (currentDeferred) {
			currentDeferred.reject();
			currentDeferred = undefined;
		}
	});
	return this;
};


/*global jQuery, document*/
jQuery.fn.modalLauncherWidget = function (mapModel) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
				keyCode = element.data('mm-launch-key-code'),
				wasFocussed;
		element.on('show',  function (evt) {
			if (this === evt.target) {
				wasFocussed = jQuery(':focus');
				if (wasFocussed.length === 0) {
					wasFocussed = jQuery(document.activeElement);
				}
				wasFocussed.blur();
				mapModel.setInputEnabled(false, false);
			}
		}).on('hide',  function (evt) {
			if (this === evt.target) {
				mapModel.setInputEnabled(true, false);
				if (wasFocussed && wasFocussed.length > 0) {
					wasFocussed.focus();
				} else {
					jQuery(document).focus();
				}
				wasFocussed = undefined;
			}
		}).on('shown', function (evt) {
			if (this === evt.target) {
				element.find('[data-mm-modal-shown-focus]').focus();
			}
		});
		if (keyCode) {
			jQuery(document).keydown(function (event) {
				if (element.parent().length === 0) {
					return;
				}
				if (String(event.which) !== String(keyCode) || !(event.metaKey || event.ctrlKey) || event.altKey) {
					return;
				}
				event.preventDefault();
				event.stopImmediatePropagation();
				if (jQuery('.modal:visible').length > 0) {
					return;
				}
				element.modal('show');
			});
		}
	});
};



/*global MM, window*/
MM.navigationDelimiters = ',;#';

MM.navigationEscape = function (toEscape, escapeChar) {
	'use strict';
	if (!toEscape) {
		return toEscape;
	}
	var regExString = '[' + MM.navigationDelimiters + ']+',
		regEx = new RegExp(regExString, 'g');
	escapeChar = escapeChar || '_';
	return toEscape.replace(regEx, escapeChar);
};

MM.navigation = function (storage, mapController) {
	'use strict';
	var self = this,
		unknownMapId = 'nil',
		mapIdRegExString = '[Mm]:([^' + MM.navigationDelimiters + ']*)',
		mapIdRegEx = new RegExp(mapIdRegExString),
		getMapIdFromHash = function () {
			var windowHash = window && window.location && window.location.hash,
				found = windowHash && mapIdRegEx.exec(windowHash);
			return found && found[1];
		},
		setMapIdInHash = function (mapId) {
			if (mapIdRegEx.test(window.location.hash)) {
				window.location.hash = window.location.hash.replace(mapIdRegEx, 'm:' + mapId);
			} else if (window.location.hash && window.location.hash !== '#') {
				window.location.hash = window.location.hash + ',m:' + mapId;
			} else {
				window.location.hash = 'm:' + mapId;
			}
		},
		changeMapId = function (newMapId) {
			if (newMapId) {
				storage.setItem('mostRecentMapLoaded', newMapId);
			}
			newMapId = newMapId || unknownMapId;
			setMapIdInHash(newMapId);
			return true;
		};
	self.initialMapId = function () {
		var initialMapId = getMapIdFromHash();
		if (!initialMapId || initialMapId === unknownMapId) {
			initialMapId = (storage && storage.getItem && storage.getItem('mostRecentMapLoaded'));
		}
		return initialMapId;
	};
	self.loadInitial = function () {
		var mapId = self.initialMapId();
		mapController.loadMap(mapId || 'new');
		return mapId;
	};
	mapController.addEventListener('mapSaved mapLoaded mapLoadingCancelled', function (newMapId) {
		changeMapId(newMapId);
	});
	self.hashChange = function () {
		var newMapId = getMapIdFromHash();
		if (newMapId === unknownMapId) {
			return;
		}
		if (!newMapId) {
			changeMapId(mapController.currentMapId());
			return false;
		}
		mapController.loadMap(newMapId);
		return true;
	};
	self.off = function () {
		window.removeEventListener('hashchange', self.hashChange);
	};
	self.on = function () {
		window.addEventListener('hashchange', self.hashChange);
	};
	self.on();
	return self;
};

/*global jQuery */
jQuery.fn.newMapWidget = function (mapController) {
	'use strict';
	this.click(function () {
		var mapSource = jQuery(this).attr('data-mm-map-source') || '';
		mapController.loadMap('new-' + mapSource + '-' + Date.now());
	});
	return this;
};

/*global jQuery, document*/
jQuery.fn.optionalContentWidget = function (mapModel, splittableController) {
	'use strict';
	var	toggleMeasures = function (force, splitContentId) {
			if (force || mapModel.getInputEnabled()) {
				splittableController.toggle(splitContentId);
			}
		};

	return jQuery.each(this, function () {
		var element = jQuery(this),
			id = element.attr('id');
		jQuery(document).keydown(element.attr('data-mm-activation-key'), toggleMeasures.bind(element, false, id));
		jQuery('[data-mm-role=' + element.attr('data-mm-activation-role') + ']').click(toggleMeasures.bind(element, true, id));
		if (element.is(':visible')) {
			element.trigger('show');
		}
	});
};

/*global $, jQuery, MM, document, MAPJS, window, atob, ArrayBuffer, Uint8Array*/
jQuery.fn.remoteExportWidget = function (mapController, alert, measureModel, configurationGenerator, storageApi, modalConfirmation) {
	'use strict';
	var alertId,
		loadedIdea,
		downloadLink = ('download' in document.createElement('a')) ? $('<a>').addClass('hide').appendTo('body') : undefined,
		dataUriToBlob = function (dataURI) {
			var byteString = atob(dataURI.split(',')[1]),
				mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0],
				ab = new ArrayBuffer(byteString.length),
				ia = new Uint8Array(ab),
				i;
			for (i = 0; i < byteString.length; i++) {
				ia[i] = byteString.charCodeAt(i);
			}
			return new window.Blob([ab], {type: mimeString});
		},
		toObjectURL = function (contents, mimeType) {
			var browserUrl = window.URL || window.webkitURL;
			if (/^data:[a-z]*\/[a-z]*/.test(contents)) {
				return browserUrl.createObjectURL(dataUriToBlob(contents));
			}
			return browserUrl.createObjectURL(new window.Blob([contents], {type: mimeType}));
		};
	mapController.addEventListener('mapLoaded', function (mapId, idea) {
		loadedIdea = idea;
	});
	return this.click(function () {
		var toPromise = function (fn, mimeType) {
				return function () {
					return jQuery.Deferred().resolve(fn.apply(undefined, arguments), mimeType).promise();
				};
			},
			exportFunctions = {
				'mup' : toPromise(function (contentObject) {
					return JSON.stringify(contentObject, null, 2);
				}, 'application/json'),
				'mm' : toPromise(MM.freemindExport, 'text/xml'),
				'html': MM.exportToHtmlDocument,
				'png': MAPJS.pngExport,
				'txt': toPromise(MM.exportIdeas.bind({}, loadedIdea, new MM.TabSeparatedTextExporter()), 'text/plain'),
				'measures-all': toPromise(function () {
						return MM.exportTableToText(measureModel.getRawData(true));
					}, 'text/tab-separated-values'),
				'measures': toPromise(function () {
						return MM.exportTableToText(measureModel.getRawData());
					}, 'text/tab-separated-values')

			},
			format = $(this).data('mm-format'),
			extension = $(this).data('mm-extension') || format,
			title,
			elem,
			hideAlert = function () {
				if (alert && alertId) {
					alert.hide(alertId);
					alertId = undefined;
				}
			},
			showErrorAlert = function (title, message) {
				hideAlert();
				alertId = alert.show(title, message, 'error');
			};
		title = loadedIdea.title + '.' + extension;
		if (alert) {
			hideAlert();
			alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Exporting map', 'This may take a few seconds for larger maps', 'info');
		}
		elem = $(this);
		if (exportFunctions[format]) {
			exportFunctions[format](loadedIdea).then(
				function (contents, mimeType) {
					var toSend = contents;
					if (!toSend) {
						return false;
					}

					if (downloadLink && (!$('body').hasClass('force-remote'))) {
						hideAlert();
						downloadLink.attr('download', title).attr('href', toObjectURL(toSend, mimeType));
						downloadLink[0].click();
					} else {
						if (/^data:[a-z]*\/[a-z]*/.test(toSend)) {
							toSend = dataUriToBlob(toSend);
							mimeType = toSend.type;
						} else {
							mimeType = 'application/octet-stream';
						}
						configurationGenerator.generateEchoConfiguration(extension, mimeType).then(
							function (exportConfig) {
								storageApi.save(toSend, exportConfig, {isPrivate: true}).then(
									function () {
										hideAlert();
										alertId = alert.show('Your map was exported.',
											' <a href="' + exportConfig.signedOutputUrl + '" target="_blank">Click here to open the file, or right-click and choose "save link as"</a>',
											'success');
									},
									function (reason) {
										if (reason === 'file-too-large') {
											hideAlert();
											modalConfirmation.showModalToConfirm(
												'Remote export',
												'Your browser requires a remote export and this map exceeds your upload limit. To export the map, please use a browser which supports in-browser downloads (such as Chrome or Firefox) or enter a MindMup Gold license to increase your limit.<br/><br/>If you are a Gold user and you see this message, please contact us at <a href="mailto:contact@mindmup.com">contact@mindmup.com</a> to arrange an offline export.',
												'Subscribe to Mindmup Gold'
											).then(
												function () {
													jQuery('#modalGoldLicense').modal('show');
												}
											);

										} else {
											showErrorAlert('Unfortunately, there was a problem exporting the map.', 'Please try again later. We have sent an error report and we will look into this as soon as possible');
										}
									}
								);
							},
							function () {
								showErrorAlert('Unfortunately, there was a problem exporting the map.', 'Please try again later. We have sent an error report and we will look into this as soon as possible');
							}
						);
					}
				}
			);
		}
	});
};

/*global MM, _ */
MM.ResourceCompressor = function (prefixTemplate) {
	'use strict';
	var self = this,
		prefix = prefixTemplate + ':',
		prefixMatcher = new RegExp('^' + prefix),
		cleanUpResources = function (contentAggregate) {
			if (!contentAggregate.resources) {
				return;
			}
			var unused = {};
			_.map(contentAggregate.resources, function (value, key) {
				unused[key] = true;
			});
			contentAggregate.traverse(function (idea) {
				var url = idea && idea.attr && idea.attr.icon && idea.attr.icon.url;
				if (url) {
					delete unused[url.substring(prefix.length)];
				}
			});
			_.each(unused, function (value, key) {
				delete contentAggregate.resources[key];
			});
		},
		replaceInlineWithResources = function (contentAggregate) {
			contentAggregate.traverse(function (idea) {
				var url = idea && idea.attr && idea.attr.icon && idea.attr.icon.url;
				if (url && !prefixMatcher.test(url)) {
					idea.attr.icon.url = prefix + contentAggregate.storeResource(url);
				}
			});
		};
	self.compress = function (contentAggregate) {
		replaceInlineWithResources(contentAggregate);
		cleanUpResources(contentAggregate);
	};
};

/*global MM, jQuery, setTimeout*/
MM.retry = function (task, shouldRetry, backoff) {
	'use strict';
	var deferred = jQuery.Deferred(),
		attemptTask = function () {
			task().then(
				deferred.resolve,
				function () {
					if (!shouldRetry || shouldRetry.apply(undefined, arguments)) {
						deferred.notify('Network problem... Will retry shortly');
						if (backoff) {
							setTimeout(attemptTask, backoff());
						} else {
							attemptTask();
						}
					} else {
						deferred.reject.apply(undefined, arguments);
					}
				},
				deferred.notify
			);
		};
	attemptTask();
	return deferred.promise();
};
MM.retryTimes = function (retries) {
	'use strict';
	return function () {
		return retries--;
	};
};
MM.linearBackoff = function () {
	'use strict';
	var calls = 0;
	return function () {
		calls++;
		return 1000 * calls;
	};
};

MM.RetriableMapSourceDecorator = function (adapter) {
	'use strict';
	var	shouldRetry = function (retries) {
			var times = MM.retryTimes(retries);
			return function (status) {
				return times() && status === 'network-error';
			};
		};
	this.loadMap = function (mapId, showAuth) {
		return MM.retry(
			adapter.loadMap.bind(adapter, mapId, showAuth),
			shouldRetry(5),
			MM.linearBackoff()
		);
	};
	this.saveMap = function (contentToSave, mapId, fileName) {
		return MM.retry(
			adapter.saveMap.bind(adapter, contentToSave, mapId, fileName),
			shouldRetry(5),
			MM.linearBackoff()
		);
	};
	this.description = adapter.description;
	this.recognises = adapter.recognises;
	this.autoSave = adapter.autoSave;
};

/*global jQuery, MM, FormData, window, _, XMLHttpRequest*/
/**
 *
 * Utility class that implements AWS S3 POST upload interface and
 * understands AWS S3 listing responses
 *
 * @class S3Api
 * @constructor
 */
MM.S3Api = function () {
	'use strict';
	var self = this;
    /**
     * Upload a file to S3 using the AWS S3 Post mechanism
     * @method save
     * @param {String} contentToSave file content to upload
     * @param {Object} saveConfiguration a hash containing
     * @param {String} saveConfiguration.key AWS S3 bucket key to upload
     * @param {String} saveConfiguration.AWSAccessKeyId AWS S3 access key ID of the requesting user
     * @param {String} saveConfiguration.policy AWS S3 POST upload policy, base64 encoded
     * @param {String} saveConfiguration.signature AWS S3 POST signed policy
     */
	this.save = function (contentToSave, saveConfiguration, options) {
		var formData = new FormData(),
			savePolicy = options && options.isPrivate ? 'bucket-owner-read' : 'public-read',
			deferred = jQuery.Deferred(),
			progress = function (evt) {
				if (evt.lengthComputable) {
					deferred.notify(Math.round((evt.loaded * 100) / evt.total, 2) + '%');
				} else {
					deferred.notify();
				}
			},
			saveFailed = function (evt) {
				var errorReasonMap = { 'EntityTooLarge': 'file-too-large' },
					errorDoc,
					errorReason,
					errorLabel;
				if (evt.status === 403) {
					deferred.reject('failed-authentication');
					return;
				}
				try {
					errorDoc = evt && (evt.responseXML || jQuery.parseXML(evt.responseText));
					errorReason = jQuery(errorDoc).find('Error Code').text();
				} catch (e) {
					// just ignore, the network error is set by default
				}
				if (!errorReason) {
					deferred.reject('network-error');
					return;
				}
				errorLabel = jQuery(errorDoc).find('Error Message').text();

				deferred.reject(errorReasonMap[errorReason], errorLabel);
			};

		['key', 'AWSAccessKeyId', 'policy', 'signature'].forEach(function (parameter) {
			formData.append(parameter, saveConfiguration[parameter]);
		});
		formData.append('acl', savePolicy);
		formData.append('Content-Type', saveConfiguration['Content-Type'] || 'text/plain');
		formData.append('file', contentToSave);
		jQuery.ajax({
			url: 'https://' + saveConfiguration.s3BucketName + '.s3.amazonaws.com/',
			type: 'POST',
			processData: false,
			contentType: false,
			data: formData,
			xhr: function () {
				var xhr = new XMLHttpRequest();
				xhr.upload.addEventListener('progress', progress);
				return xhr;
			}
		}).then(deferred.resolve, saveFailed, progress);
		return deferred.promise();
	};
	self.pollerDefaults = {sleepPeriod: 1000, timeoutPeriod: 120000};
    /**
     * Poll until a file becomes available on AWS S3
     * @method poll
     * @param {String} signedListUrl a signed AWS S3 URL for listing on a key prefix
     * @param {Object} [opts] additional options
     * @param {int} [opts.sleepPeriod] sleep period in milliseconds between each poll (default=1 sec)
     * @param {int} [opts.timeoutPeriod] maximum total time before polling operation fails (default = 12 secs)
     * @param {function} [opts.stoppedSemaphore] a predicate function that is checked to see if polling should be aborted
     */
	self.poll = function (signedListUrl, options) {
		var sleepTimeoutId,
			timeoutId,
			deferred = jQuery.Deferred(),
			shouldPoll = function () {
				return deferred && !(options.stoppedSemaphore && options.stoppedSemaphore());
			},
			execRequest = function () {
				var setSleepTimeout = function () {
					if (shouldPoll()) {
						options.sleepTimeoutId = window.setTimeout(execRequest, options.sleepPeriod);
					}
				};
				if (shouldPoll()) {
					jQuery.ajax({
						url: signedListUrl,
						timeout: options.sleepPeriod,
						method: 'GET'
					}).then(function success(result) {
						var key = jQuery(result).find('Contents Key').first().text();
						if (deferred && key) {
							window.clearTimeout(timeoutId);
							deferred.resolve(key);
						} else {
							setSleepTimeout();
						}
					}, setSleepTimeout);
				} else {
					window.clearTimeout(timeoutId);
				}
			},
			cancelRequest = function () {
				if (shouldPoll()) {
					deferred.reject('polling-timeout');
				}
				window.clearTimeout(sleepTimeoutId);
				deferred = undefined;
			};
		options = _.extend({}, self.pollerDefaults, options);

		if (shouldPoll()) {
			timeoutId = window.setTimeout(cancelRequest, options.timeoutPeriod);
			execRequest();
		}
		return deferred.promise();
	};
	self.loadUrl = function (url) {
		var deferred = jQuery.Deferred();
		jQuery.ajax(
			url, { cache: false}).then(
			deferred.resolve,
			function (err) {
				if (err.status === 404 || err.status === 403) {
					deferred.reject('map-not-found');
				} else {
					deferred.reject('network-error');
				}

			});
		return deferred.promise();
	};
};

/*jslint forin: true*/
/*global jQuery, MM, _*/
MM.S3ConfigGenerator = function (s3Url, publishingConfigUrl, folder) {
	'use strict';
	this.generate = function () {
		var deferred = jQuery.Deferred(),
			options = {
				url: publishingConfigUrl,
				dataType: 'json',
				type: 'POST',
				processData: false,
				contentType: false
			};
		jQuery.ajax(options).then(
			function (jsonConfig) {
				jsonConfig.s3Url = s3Url;
				jsonConfig.mapId = jsonConfig.s3UploadIdentifier;
				deferred.resolve(jsonConfig);
			},
			deferred.reject.bind(deferred, 'network-error')
		);
		return deferred.promise();
	};
	this.buildMapUrl = function (mapId) {
		return jQuery.Deferred().resolve(s3Url + folder + mapId + '.json').promise();
	};
};

MM.S3FileSystem = function (publishingConfigGenerator, prefix, description) {
	'use strict';

	var properties = {editable: true},
		s3Api = new MM.S3Api(),
		lastSavePublishingConfig;
	this.description = description;
	this.prefix = prefix;
	this.recognises = function (mapId) {
		return mapId && mapId[0] === prefix;
	};
	this.loadMap = function (mapId, showAuthentication) {
		var deferred = jQuery.Deferred(),
			onMapLoaded = function (result) {
				deferred.resolve(result, mapId, 'application/json', properties);
			};
		publishingConfigGenerator.buildMapUrl(mapId, prefix, showAuthentication).then(
			function (mapUrl) {
				s3Api.loadUrl(mapUrl).then(onMapLoaded, deferred.reject);
			},
			deferred.reject
		);
		return deferred.promise();
	};
	this.saveMap = function (contentToSave, mapId, fileName, showAuthenticationDialog) {
		var deferred = jQuery.Deferred(),
			submitS3Form = function (publishingConfig) {
				lastSavePublishingConfig = publishingConfig;
				s3Api.save(contentToSave, publishingConfig, {'isPrivate': false}).then(
					function () {
						deferred.resolve(publishingConfig.mapId, _.extend(publishingConfig, properties));
					},
					deferred.reject
				);
			};
		publishingConfigGenerator.generate(mapId, fileName, prefix, showAuthenticationDialog).then(
			submitS3Form,
			deferred.reject
		);
		return deferred.promise();
	};
	this.destroyLastSave = function () {
		return s3Api.save('{"title": "This map was removed by its author"}', lastSavePublishingConfig, {'isPrivate': false});
	};
};


/*global window, $, _, jQuery*/
jQuery.fn.saveWidget = function (mapController) {
	'use strict';
	var mapChanged = false,
		repository,
		autoSave,
		element = jQuery(this),
		saveButton = element.find('button[data-mm-role=publish]'),
		resetSaveButton = function () {
			if (saveButton.attr('disabled')) {
				saveButton.text('Save').addClass('btn-primary').removeAttr('disabled');
				element.find('.dropdown-toggle').removeAttr('disabled');
			}
		},
		mapChangedListener = function () {
			mapChanged = true;
			resetSaveButton();
		},
		setDefaultRepo = function (mapId) {
			var validrepos = mapController.validMapSourcePrefixesForSaving,
				repoClasses = _.map(validrepos, function (x) {
					return 'repo-' + x + ' ';
				}).join('');
			repository = (mapId && mapId[0]);
			if (/^new-/.test(mapId) && mapId.length > 4) {
				repository = mapId[4];
			}
			if (!_.contains(validrepos, repository)) {
				repository = validrepos[0];
			}
			element.find('[data-mm-role=currentrepo]').removeClass(repoClasses).addClass('repo repo-' + repository);
		};
	$(window).keydown(function (evt) {
		if (evt.which === 83 && (evt.metaKey || evt.ctrlKey) && !evt.altKey) {
			if (!autoSave && mapChanged) {
				mapController.publishMap(repository);
			}
			evt.preventDefault();
		}
	});
	element.find('[data-mm-role=publish]').add('a[data-mm-repository]', element).click(function () {
		mapController.publishMap($(this).attr('data-mm-repository') || repository);
	});
	element.find('a[data-mm-repository]').addClass(function () {
		return 'repo repo-' + $(this).data('mm-repository');
	});

	mapController.addEventListener('mapSaving', function () {
		saveButton
			.html('<i class="icon-spinner icon-spin"></i>&nbsp;Saving')
			.attr('disabled', true)
			.removeClass('btn-primary');
		element.find('.dropdown-toggle').attr('disabled', true);
	});
	mapController.addEventListener('mapSavingFailed mapSavingUnAuthorized authorisationFailed authRequired mapSavingCancelled mapSavingTooLarge', resetSaveButton);

	mapController.addEventListener('mapLoaded mapSaved', function (mapId, idea, properties) {
		setDefaultRepo(mapId);
		mapChanged = false;
		saveButton.text('Save').attr('disabled', true).removeClass('btn-primary');
		element.find('.dropdown-toggle').removeAttr('disabled');
		autoSave = properties.autoSave;
		if (!autoSave) {
			idea.addEventListener('changed', mapChangedListener);
		} else {
			saveButton.text(' Auto-saved');
		}
	});
	return element;
};

/*global jQuery, window*/
jQuery.fn.scalableModalWidget = function () {
	'use strict';
	return jQuery.each(this, function () {
		var modal = jQuery(this),
			resize = function () {
				modal.find('.modal-body').css('max-height', 'none').height(modal.height() - modal.find('.modal-header').outerHeight(true) - modal.find('.modal-footer').outerHeight(true));
			};
		modal.on('shown', resize);
		jQuery(window).on('resize', function () {
			if (modal.is(':visible')) {
				resize();
			}
		});
	});
};

/*global $, _*/
$.fn.searchWidget = function (keyBinding, mapModel) {
	'use strict';
	var element = this,
		show = function () {
			if (!mapModel.getInputEnabled()) {
				return;
			}
			var input,
				hide = function () {
					if (input) {
						input.remove();
					}
					mapModel.setInputEnabled(true);
				},
				commit = function (value) {
					var id = value.substring(0, value.indexOf(':'));
					hide();
					mapModel.centerOnNode(id);
				};
			mapModel.setInputEnabled(false);
			input  = $('<input type="text" autocomplete="off" placeholder="Type a part of the node title">')
				.css('position', 'absolute')
				.css('z-index', '9999')
				.appendTo(element)
				.css('top', '30%')
				.css('left', '40%')
				.css('width', '20%')
				.css('border-width', '5px')
				.focus()
				.blur(hide)
				.keyup('Esc', hide)
				.typeahead({
					source: function (query) {
						return _.map(mapModel.search(query), function (i) {
							return i.id + ':' + i.title;
						});
					},
					updater: commit,

					highlighter: function (item) {
						return item.replace(/[^:]+:/, '');
					}

				});
		};
	element.keydown(keyBinding, function (e) {
		show();
		e.preventDefault();
		e.stopPropagation();
	}).find('[data-mm-role=show-map-search]').click(show);
	return element;
};

/*global jQuery*/
jQuery.fn.selectableReadOnlyInputWidget = function () {
	'use strict';
	return this.css('cursor', 'pointer').on('input change', function () {
		var element = jQuery(this);
		element.val(element.attr('data-mm-val'));
	}).click(function () {
		if (this.setSelectionRange) {
			this.setSelectionRange(0, this.value.length);
		} else if (this.select) {
			this.select();
		}
	});
};

/*global jQuery, MM, _*/
jQuery.fn.sendToGoogleDriveWidget = function (googleDriveAdapter) {
	'use strict';
	return this.each(function () {
		var self = jQuery(this),
			lastSavedId = false,
			fileNameField = self.find('[data-mm-role~=send-to-drive-file-name]'),
			formControlGroup = fileNameField.parents('div.control-group'),
			urlField =  self.find('[data-mm-role~=send-to-drive-url]'),
			convertibleTypes = [
				'application/vnd.openxmlformats-officedocument.presentationml.presentation',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			],
			fileName = function () {
				var result = fileNameField.val();
				if (result) {
					result = result.trim();
				}
				return result;
			},
			setState = function (state) {
				self.find('.visible').hide();
				self.find('.visible' + '.' + state).show().find('[data-mm-show-focus]').focus();
			},
			setStatusMessage = function (message, progress) {
				self.find('[data-mm-role~=send-to-drive-status]').text(message + ' ' + (progress || ''));
			},
			transferFile = function () {
				MM.ajaxBlobFetch(urlField.val()).then(
					function (blob) {
						googleDriveAdapter.binaryUpload(blob, fileName(), blob.type, _.contains(convertibleTypes, blob.type)).then(
							function (result) {
								self.find('[data-mm-role~=send-to-drive-result-link]').attr('href', result.link);
								lastSavedId = result.id;
								setState('send-to-drive-done');
							},
							function (errorCode) {
								if (errorCode === 'not-authenticated') {
									setState('send-to-drive-unauthorised');
								} else {
									setStatusMessage ('File upload failed', errorCode);
									setState('send-to-drive-error');
								}
							},
							function (percentComplete) {
								setStatusMessage ('Uploading content', percentComplete);
							});
					},
					function (xhr, statusText) {
						setStatusMessage ('File retrieval failed', statusText);
						setState('send-to-drive-error');
					},
					function (percentComplete) {
						setStatusMessage ('Retrieving file', percentComplete);
					});
			},
			start = function () {
				var buttonClicked = jQuery(this),
						shouldShowDialogs = buttonClicked.is('[data-mm-showdialogs]');
				lastSavedId = false;
				if (fileName()) {
					setState('send-to-drive-progress');
					setStatusMessage ('Authorising with Google Drive');
					googleDriveAdapter.ready(shouldShowDialogs).then(transferFile, function () {
						if (!shouldShowDialogs) {
							setState('send-to-drive-unauthorised');
						} else {
							setStatusMessage ('Authorisation with Google failed');
							setState('send-to-drive-error');
						}
					});
				} else {
					fileNameField.parents('div.control-group').addClass('error');
				}
			};
		fileNameField.on('input change', function () {
			if (fileName()) {
				formControlGroup.removeClass('error');
			} else {
				formControlGroup.addClass('error');
			}
		});
		self.find('[data-mm-role=send-to-drive-kickoff]').click(start);

		self.find('[data-mm-role=send-to-drive-share]').click(function () {
			if (lastSavedId) {
				googleDriveAdapter.showSharingSettings(lastSavedId);
			}
		});
	});
};

/*global jQuery, _*/
jQuery.fn.splitFlipWidget = function (splittableController, menuSelector, mapModel, keyStroke) {
	'use strict';
	var self = jQuery(this),
		onFlipRequest = function (force) {
			if (force || mapModel.isEditingEnabled()) {
				splittableController.flip();
			}
		};
	_.each(self.find(menuSelector), function (elem) {
		var element = jQuery(elem);
		element.click(function () {
			onFlipRequest(true);
		});
	});
	self.keydown(keyStroke, onFlipRequest.bind(self, false));
	return self;
};

/*global MM, observable, _*/
MM.SplittableController = function (element, mapModel, storage, storageKey, defaultContent) {
	'use strict';
	var self = observable(this),
		allPositions = [MM.SplittableController.NO_SPLIT, MM.SplittableController.ROW_SPLIT, MM.SplittableController.COLUMN_SPLIT],
		calcSplit = function () {
			if (element.innerHeight() > element.innerWidth()) {
				return MM.SplittableController.ROW_SPLIT;
			} else {
				return MM.SplittableController.COLUMN_SPLIT;
			}
		};
	self.split = function (position) {
		if (!_.contains(allPositions, position)) {
			return false;
		}
		element.removeClass(allPositions.join(' ')).addClass(position);
		this.dispatchEvent('split', position);
		mapModel.centerOnNode(mapModel.getCurrentlySelectedIdeaId());
		return true;
	};
	self.currentSplit = function () {
		var bodyPosition = _.find(allPositions, function (position) {
			return element.hasClass(position);
		});
		return bodyPosition || MM.SplittableController.NO_SPLIT;
	};
	self.toggle = function (elementId) {
		if (elementId === storage[storageKey]) {
			if (self.currentSplit() === MM.SplittableController.NO_SPLIT) {
				self.split(calcSplit());
				element.find('#' + elementId).trigger('show');
			} else {
				self.split(MM.SplittableController.NO_SPLIT);
				element.find('#' + elementId).trigger('hide');
			}
		} else {
			element.find('[data-mm-role=optional-content]').hide();
			element.find('#' + elementId).show();
			if (self.currentSplit() === MM.SplittableController.NO_SPLIT) {
				self.split(calcSplit());
			} else {
				element.find('#' + storage[storageKey]).trigger('hide');
			}
			element.find('#' + elementId).trigger('show');
		}
		storage[storageKey] = elementId;

	};
	self.flip = function () {
		var currentSplit = self.currentSplit();
		if (currentSplit === MM.SplittableController.NO_SPLIT) {
			return false;
		}
		if (currentSplit === MM.SplittableController.ROW_SPLIT) {
			return self.split(MM.SplittableController.COLUMN_SPLIT);
		} else {
			return self.split(MM.SplittableController.ROW_SPLIT);
		}
	};
	element.find('[data-mm-role=optional-content]').hide();

	if (!storage[storageKey]) {
		storage[storageKey] = defaultContent;
	}
	element.find('#' + storage[storageKey]).show();

};

MM.SplittableController.NO_SPLIT = 'no-split';
MM.SplittableController.COLUMN_SPLIT = 'column-split';
MM.SplittableController.ROW_SPLIT = 'row-split';


/*global MM, observable, _ */
MM.StoryboardController = function (storyboardModel) {
	/* workflows, event processing */
	'use strict';
	var self = observable(this),
		buildStoryboardScene = function (storyboardName, index, sceneType) {
			var attr = {}, result;
			attr[storyboardName] = index;
			result = {
				'storyboards': attr
			};
			if (sceneType) {
				result.type = sceneType;
			}
			return result;
		},
		appendScene = function (storyboardName, nodeId, index, sceneType) {
			var scenes = storyboardModel.getScenesForNodeId(nodeId),
				result = buildStoryboardScene(storyboardName, index, sceneType);
			scenes.push(result);
			storyboardModel.setScenesForNodeId(nodeId, scenes);
		};
	self.addScene = function (nodeId, beforeScene, sceneType) {
		var storyboardName = storyboardModel.getActiveStoryboardName(),
			index = 1;
		if (!storyboardName) {
			storyboardName = storyboardModel.createStoryboard();
		}
		if (beforeScene) {
			index = storyboardModel.insertionIndexBefore(beforeScene);
		} else {
			index = storyboardModel.nextSceneIndex();
		}
		if (!index) {
			storyboardModel.rebalanceAndApply([beforeScene], function (newScenes) {
				appendScene(storyboardName, nodeId, storyboardModel.insertionIndexBefore(newScenes[0]), sceneType);
			});
		} else {
			appendScene(storyboardName, nodeId, index, sceneType);
		}
	};
	self.moveSceneAfter = function (sceneToMove, afterScene) {
		if (!sceneToMove) {
			return false;
		}
		var storyboardName = storyboardModel.getActiveStoryboardName(),
			scenes,
			newIndex,
			currentIndex,
			afterSceneIndex;
		if (afterScene && afterScene.ideaId === sceneToMove.ideaId && afterScene.index === sceneToMove.index) {
			return false;
		}
		scenes = storyboardModel.getScenes();
		if (!scenes || !scenes.length) {
			return false;
		}
		currentIndex = _.indexOf(scenes, _.find(scenes, function (scene) {
			return scene.ideaId === sceneToMove.ideaId && scene.index === sceneToMove.index;
		}));
		if (currentIndex === -1) {
			return false;
		}
		if (afterScene) {
			if (currentIndex > 0) {
				afterSceneIndex = _.indexOf(scenes, _.find(scenes, function (scene) {
					return scene.ideaId === afterScene.ideaId && scene.index === afterScene.index;
				}));
				if (currentIndex === (afterSceneIndex + 1)) {
					return false;
				}
			}
			newIndex = storyboardModel.insertionIndexAfter(afterScene);
		} else {
			if (currentIndex === 0) {
				return false;
			}
			newIndex = storyboardModel.insertionIndexAfter();
		}
		if (!newIndex) {
			storyboardModel.rebalanceAndApply([sceneToMove, afterScene],
				function (rebalancedScenes) {
					storyboardModel.updateSceneIndex(rebalancedScenes[0], storyboardModel.insertionIndexAfter(rebalancedScenes[1]), storyboardName);
				}
			);
		} else {
			storyboardModel.updateSceneIndex(sceneToMove, newIndex, storyboardName);
		}
		return true;
	};

	self.removeScenesForIdeaId = function (ideaId) {
		var storyboardName = storyboardModel.getActiveStoryboardName(),
			scenes = storyboardName && storyboardModel.getScenesForNodeId(ideaId),
			didRemoveScene;

		if (!storyboardName) {
			return false;
		}
		_.each(scenes, function (scene) {
			if (scene.storyboards && scene.storyboards[storyboardName]) {
				delete scene.storyboards[storyboardName];
				didRemoveScene = true;
			}
		});
		if (!didRemoveScene) {
			return false;
		}
		scenes = _.reject(scenes, function (scene) {
			return _.size(scene.storyboards) === 0;
		});
		storyboardModel.setScenesForNodeId(ideaId, scenes);
		return true;
	};
	self.removeScene = function (sceneToRemove) {
		if (!sceneToRemove || !sceneToRemove.ideaId || !sceneToRemove.index) {
			return false;
		}
		var storyboardName = storyboardModel.getActiveStoryboardName(),
			scenes = storyboardName && storyboardModel.getScenesForNodeId(sceneToRemove.ideaId);

		if (!storyboardName) {
			return false;
		}
		_.each(scenes, function (scene) {
			if (scene.storyboards && scene.storyboards[storyboardName] && scene.storyboards[storyboardName] === sceneToRemove.index) {
				delete scene.storyboards[storyboardName];
			}
		});
		scenes = _.reject(scenes, function (scene) {
			return _.size(scene.storyboards) === 0;
		});
		storyboardModel.setScenesForNodeId(sceneToRemove.ideaId, scenes);
	};
};

/*global MM, _, jQuery*/
/* todo:
 *  - center image in its half
 */
MM.StoryboardDimensionProvider = function (resourceManager) {
	'use strict';
	var self = this,
		fakeDIV = jQuery('<div>').attr('data-mm-role', 'storyboard-sizer').addClass('storyboard-scene-title')
		.css({'z-index': '-99', 'visibility': 'hidden'}),
		findFontSize = function (title, width, height) {
			fakeDIV.css({'max-width': width}).appendTo('body').text(title);
			var result = {fontSize: height * 0.5 },
				multiplier = 0.9;
			do {
				result.fontSize = Math.floor(result.fontSize * multiplier);
				result.lineHeight = Math.floor(result.fontSize * 1.3);
				fakeDIV.css('font-size', result.fontSize + 'px');
				fakeDIV.css('line-height', result.lineHeight + 'px');
			} while ((fakeDIV.height() > height || fakeDIV[0].scrollWidth > width) && result.fontSize > height / 30);
			result.textWidth = fakeDIV.width();
			fakeDIV.detach();
			return result;
		},
		hasBullets = function (text) {
			var result = /\n-/.test(text);
			return result;
		};
	self.getDimensionsForScene = function (scene, width, height) {
		var padding = width / 16,
			result = {
				text:  {
					'height': height - 2 * padding,
					'width': width - 2 * padding,
					'padding-top': padding,
					'padding-bottom': padding,
					'padding-left': padding,
					'padding-right': padding,
					toCss: function () {
						return _.extend({
							'font-size': result.text.fontSize + 'px',
							'line-height': result.text.lineHeight +  'px'
						}, _.omit(result.text, 'fontSize', 'lineHeight'));
					}
				},
				image: {
					toCss: function () {
						return {
							'background-image': '',
							'background-repeat': '',
							'background-size': '',
							'background-position': ''
						};
					}
				}
			},
			imageScale = 1, maxImageHeight = height, maxImageWidth = width, textDims, additionalPadding;

		if (scene.image) {
			if (scene.image.position === 'top' || scene.image.position === 'bottom') {
				maxImageHeight = height / 2 - padding;
				result.text['padding-' + scene.image.position] = height / 2;
				result.text.height = height / 2 - padding;
			} else if (scene.image.position === 'left' || scene.image.position  === 'right') {
				maxImageWidth = width / 2 - padding;
				result.text['padding-' + scene.image.position] = width / 2;
				result.text.width = width / 2 -  padding;
			}
			imageScale = maxImageWidth / scene.image.width;
			if (imageScale > maxImageHeight / scene.image.height) {
				imageScale = maxImageHeight / scene.image.height;
			}
			result.image = {
				'url': scene.image.url,
				'height': (imageScale * scene.image.height),
				'width': (imageScale * scene.image.width)
			};
			if (scene.image.position === 'top') {
				result.image.top =  0.25 * height - result.image.height * 0.5;
				result.image.left = (width - result.image.width) / 2;
			} else if (scene.image.position === 'bottom') {
				result.image.top =  0.75 * height - result.image.height * 0.5;
				result.image.left = (width - result.image.width) / 2;
			} else if (scene.image.position === 'left') {
				result.image.top = (height - result.image.height) / 2;
				result.image.left = (width / 2 - result.image.width) / 2;
			} else if (scene.image.position === 'right') {
				result.image.top = (height - result.image.height) / 2;
				result.image.left = 0.75 * width - result.image.width * 0.5;
			} else {
				result.image.top = (height - result.image.height) / 2;
				result.image.left = (width - result.image.width) / 2;
			}
			result.image.toCss = function () {
				return {
					'background-image': 'url("' + resourceManager.getResource(scene.image.url) + '")',
					'background-repeat': 'no-repeat',
					'background-size': (imageScale * scene.image.width) + 'px ' + (imageScale * scene.image.height) + 'px',
					'background-position':  result.image.left + 'px ' + result.image.top + 'px'
				};
			};
		}
		if (hasBullets(scene.title)) {
			result.text['text-align'] = 'left';
		}
		textDims = findFontSize(scene.title, result.text.width, result.text.height);
		result.text.fontSize = textDims.fontSize;
		result.text.lineHeight = textDims.lineHeight;
		additionalPadding = (result.text.width - textDims.textWidth) / 2;
		if (additionalPadding > 0) {
			result.text.width = textDims.textWidth;
			result.text['padding-left'] += additionalPadding;
			result.text['padding-right'] += additionalPadding;
		}
		return result;
	};

};

MM.buildStoryboardExporter = function (storyboardModel, dimensionProvider, resourceTranslator) {
	'use strict';
	return function () {
		var scenes = storyboardModel.getScenes();
		if (_.isEmpty(scenes)) {
			return {};
		}
		return {storyboard:
			_.map(scenes, function (scene) {
				var result = _.extend({title: scene.title}, dimensionProvider.getDimensionsForScene(scene, 800, 600));
				if (result.image && result.image.url) {
					result.image.url = resourceTranslator(result.image.url);
				}
				return result;
			})
		};
	};
};

/*global MM, observable, _ */
MM.Storyboard = {};

MM.Storyboard.scene = function (sceneMap) {
	'use strict';
	if (!sceneMap) {
		return undefined;
	}
	sceneMap.matchesScene = function (anotherScene) {
		if (!sceneMap || !anotherScene) {
			return false;
		}
		/*jslint eqeq:true */
		if (sceneMap.ideaId != anotherScene.ideaId) {
			return false;
		}
		if (sceneMap.index !== anotherScene.index) {
			return false;
		}
		return true;
	};
	sceneMap.clone = function () {
		return MM.Storyboard.scene(_.extend({}, sceneMap));
	};
	return sceneMap;
};

MM.Storyboard.sceneList = function (listOfScenes) {
	'use strict';
	if (!listOfScenes) {
		return undefined;
	}
	listOfScenes.findScene = function (sceneToFind) {
		if (!sceneToFind) {
			return undefined;
		}
		MM.Storyboard.scene(sceneToFind);
		return _.find(listOfScenes, function (sceneInList) {
			return sceneToFind.matchesScene(sceneInList);
		});
	};
	listOfScenes.indexOfScene = function (sceneToIndex) {
		if (!sceneToIndex) {
			return -1;
		}
		var found = listOfScenes.findScene(sceneToIndex);
		if (found) {
			return _.indexOf(listOfScenes, found);
		}
		return -1;
	};
	listOfScenes.nextSceneIndex = function () {
		var maxScene = _.max(listOfScenes, function (scene) {
			return scene && scene.index;
		});
		if (!maxScene || !maxScene.index) {
			return 1;
		}
		return maxScene.index + 1;
	};

	return listOfScenes;
};

MM.StoryboardModel = function (activeContentListener, storyboardAttrName, sceneAttrName) {
	'use strict';
	var self = observable(this),
		isInputEnabled,
		scenesForActiveStoryboard,
		rebuildScenesForActiveStoryboard = function () {
			var storyboardName = self.getActiveStoryboardName(),
				result = [],
				getTitle = function (idea, sceneType) {
					var result = idea.title;
					if (sceneType === 'with-children') {
						_.each(idea.sortedSubIdeas(), function (subIdea) {
							result = result + '\n- ' + subIdea.title;
						});
					}
					return result;
				};
			if (!storyboardName) {
				scenesForActiveStoryboard = MM.Storyboard.sceneList(result);
				return;
			}
			activeContentListener.getActiveContent().traverse(function (idea) {
				var scenes = idea.getAttr(sceneAttrName);
				if (scenes) {
					_.each(scenes, function (scene) {
						var sceneIndex = parseFloat(scene.storyboards[storyboardName]), converted, icon;
						if (sceneIndex) {
							converted = {ideaId: idea.id, title: getTitle(idea, scene.type), index: sceneIndex};
							icon = idea.getAttr('icon');
							if (icon) {
								converted.image = icon;
							}
							result.push(converted);
						}
					});
				}
			});
			scenesForActiveStoryboard = MM.Storyboard.sceneList(_.sortBy(result, 'index'));
		},
		indexMatches = function (idx1, idx2) {
			return Math.abs(idx1 - idx2) < 0.0001;
		},
		findMaxIndex = function (arr) {
			if (!arr) {
				return 0;
			}
			var maxIndex = arr.length;
			_.each(arr, function (boardName) {
				var match = boardName.match(/^Storyboard ([1-9]+)/),
					idx = (match && match.length > 1 && parseFloat(match[1])) || 0;
				if (idx > maxIndex) {
					maxIndex = idx;
				}
			});
			return maxIndex;
		},
		onActiveContentChanged = function () {
			var oldScenes = scenesForActiveStoryboard,
				getSceneDelta = function (oldScenes, newScenes) {
					var result = {removed: [], added: [], contentUpdated: []};
					MM.Storyboard.sceneList(oldScenes);
					MM.Storyboard.sceneList(newScenes);
					_.each(oldScenes, function (oldScene) {
						var newScene = newScenes && newScenes.findScene(oldScene);
						if (!newScene) {
							result.removed.push(oldScene);
						} else if (newScene.title !== oldScene.title || !_.isEqual(newScene.image, oldScene.image)) {
							result.contentUpdated.push(newScene);
						}
					});
					_.each(newScenes, function (newScene) {
						var oldScene  = oldScenes && oldScenes.findScene(newScene);
						if (!oldScene) {
							result.added.push(newScene);
						}

					});
					if (result.added.length === 1 && result.removed.length === 1 && result.contentUpdated.length === 0 &&
							result.added[0].ideaId === result.removed[0].ideaId) {
						return { moved: {from: result.removed[0], to: result.added[0]} };
					}
					return result;
				},
				delta;
			rebuildScenesForActiveStoryboard();
			delta = getSceneDelta(oldScenes, scenesForActiveStoryboard);

			_.each(delta.removed, function (scene) {
				self.dispatchEvent('storyboardSceneRemoved', scene);
			});
			_.each(delta.added, function (scene) {
				self.dispatchEvent('storyboardSceneAdded', scene);
			});
			_.each(delta.contentUpdated, function (scene) {
				self.dispatchEvent('storyboardSceneContentUpdated', scene);
			});
			if (delta.moved) {
				self.dispatchEvent('storyboardSceneMoved', delta.moved);
			}
		};
	self.setInputEnabled = function (isEnabled) {
		isInputEnabled = isEnabled;
		self.dispatchEvent('inputEnabled', isEnabled);
	};
	self.getInputEnabled = function () {
		return isInputEnabled;
	};
	self.getActiveStoryboardName = function () {
		var content = activeContentListener && activeContentListener.getActiveContent(),
			list = content && content.getAttr(storyboardAttrName);
		if (list && list.length > 0) {
			return list[0];
		}
	};
	self.createStoryboard = function () {
		var content = activeContentListener && activeContentListener.getActiveContent(),
			boards = (content && content.getAttr(storyboardAttrName)) || [],
			maxIndex = findMaxIndex(boards),
			name = 'Storyboard ' + (maxIndex + 1);
		if (!content) {
			return;
		}
		boards.push(name);
		content.updateAttr(content.id, storyboardAttrName, boards);
		return name;
	};
	self.nextSceneIndex = function () {
		return scenesForActiveStoryboard && scenesForActiveStoryboard.nextSceneIndex();
	};
	self.updateSceneIndex = function (sceneToMove, newIndex, storyboardName) {
		var scenesForIdea = self.getScenesForNodeId(sceneToMove.ideaId);
		_.each(scenesForIdea, function (scene) {
			if (scene.storyboards && scene.storyboards[storyboardName] && scene.storyboards[storyboardName] === sceneToMove.index) {
				scene.storyboards[storyboardName] = newIndex;
			}
		});
		self.setScenesForNodeId(sceneToMove.ideaId, scenesForIdea);
		return _.extend({}, sceneToMove, {index: newIndex});
	};
	self.getScenesForNodeId = function (nodeId) {
		var scenes = activeContentListener.getActiveContent().getAttrById(nodeId, sceneAttrName) || [];
		return JSON.parse(JSON.stringify(scenes));
	};
	self.setScenesForNodeId = function (nodeId, scenes) {
		activeContentListener.getActiveContent().updateAttr(nodeId, sceneAttrName, scenes);
	};
	self.scenesMatch = function (scene1, scene2) {
		if (!scene1 || !scene2) {
			return false;
		}
		if (scene1.ideaId !== scene2.ideaId) {
			return false;
		}
		if (scene1.index !== scene2.index) {
			return false;
		}
		return true;
	};
	self.rebalance = function (scenesOfInterest) {
		var scenesToReturn = [],
				nextIndex = 1,
				storyboard = self.getActiveStoryboardName();
		_.each(scenesForActiveStoryboard, function (scene) {
			var sceneOfInterest = _.find(scenesOfInterest, function (sceneOfInterest) {
					return self.scenesMatch(scene, sceneOfInterest);
				}),
				indexOfInterest = sceneOfInterest !== undefined ? _.indexOf(scenesOfInterest, sceneOfInterest) : -1,
				reIndexedScene = self.updateSceneIndex(scene, nextIndex, storyboard);
			nextIndex++;
			if (indexOfInterest >= 0) {
				scenesToReturn[indexOfInterest] = reIndexedScene;
			}
		});
		return scenesToReturn;
	};
	self.rebalanceAndApply = function (scenesOfInterest, applyFunc) {
		var activeContent = activeContentListener.getActiveContent(),
				scenesOfInterestAfter;
		activeContent.startBatch();
		scenesOfInterestAfter = self.rebalance(scenesOfInterest);
		onActiveContentChanged();
		applyFunc(scenesOfInterestAfter);
		activeContent.endBatch();
	};
	self.insertionIndexAfter = function (sceneToInsertAfter) {
		var sceneToInsertAfterPosition,
			nextIndex,
			result,
			indexToInsertAtStart = function () {
				var result;
				if (scenesForActiveStoryboard.length === 0) {
					return false;
				} else {
					result = scenesForActiveStoryboard[0].index / 2;
					if (indexMatches(result, scenesForActiveStoryboard[0].index)) {
						return false; /* rebalance required */
					} else {
						return result;
					}
				}
			};
		if (!sceneToInsertAfter) {
			return indexToInsertAtStart();
		}
		sceneToInsertAfterPosition = _.indexOf(scenesForActiveStoryboard, _.find(scenesForActiveStoryboard, function (scene) {
			return scene.ideaId === sceneToInsertAfter.ideaId && scene.index === sceneToInsertAfter.index;
		}));
		if (sceneToInsertAfterPosition < 0) {
			return false;
		}
		if (sceneToInsertAfterPosition === scenesForActiveStoryboard.length - 1) {
			return sceneToInsertAfter.index + 1;
		}
		nextIndex = scenesForActiveStoryboard[sceneToInsertAfterPosition + 1].index;
		result = (sceneToInsertAfter.index + nextIndex) / 2;
		if (indexMatches(result, nextIndex) || indexMatches(result, sceneToInsertAfter.index)) {
			return false;
		}
		return result;
	};
	self.insertionIndexBefore = function (sceneToInsertBefore) {
		var sceneToInsertBeforePosition,
			previousIndex = 0,
			result;
		if (!sceneToInsertBefore) {
			return false;
		}
		sceneToInsertBeforePosition = scenesForActiveStoryboard.indexOfScene(sceneToInsertBefore);
		if (sceneToInsertBeforePosition < 0) {
			return false;
		}
		if (sceneToInsertBeforePosition !== 0) {
			previousIndex = scenesForActiveStoryboard[sceneToInsertBeforePosition - 1].index;
		}
		result = (sceneToInsertBefore.index + previousIndex) / 2;
		if (indexMatches(result, previousIndex) || indexMatches(result, sceneToInsertBefore.index)) {
			return false;
		}
		return result;

	};
	self.getScenes = function () {
		return scenesForActiveStoryboard;
	};
	activeContentListener.addListener(onActiveContentChanged);
};



/*global jQuery, _*/
jQuery.fn.updateScene = function (scene, dimensionProvider) {
	'use strict';
	var dimensions = dimensionProvider.getDimensionsForScene(scene, this.innerWidth(), this.innerHeight());
	this.find('[data-mm-role=scene-title]').text(scene.title).css(dimensions.text.toCss());
	this.css(dimensions.image.toCss());
	return this;
};
jQuery.fn.scrollSceneIntoFocus = function () {
	'use strict';
	this.siblings('.activated-scene').removeClass('activated-scene');
	this[0].scrollIntoView();
	this.addClass('activated-scene');
	return this;
};
jQuery.fn.storyboardWidget = function (storyboardController, storyboardModel, dimensionProvider, mapModel) {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			template = element.find('[data-mm-role=scene-template]'),
			noScenes = element.find('[data-mm-role=no-scenes]').detach(),
			templateParent = template.parent(),
			removeSelectedScenes = function () {
				_.each(templateParent.find('.activated-scene'), function (domScene) {
					var scene = jQuery(domScene).data('scene');
					if (scene) {
						storyboardController.removeScene(scene);
					}
				});
			},
			moveSceneLeft = function (scene) {
				var thisScene = scene && scene.data('scene'),
					prev = thisScene && scene.prev() && scene.prev().prev(),
					prevScene = prev && prev.data('scene');
				if (thisScene) {
					storyboardController.moveSceneAfter(thisScene, prevScene);
				}
			},
			moveSceneRight = function (scene) {
				var thisScene = scene && scene.data('scene'),
					next = thisScene && scene.next(),
					nextScene = next && next.data('scene');
				if (thisScene && nextScene) {
					storyboardController.moveSceneAfter(thisScene, nextScene);
				}
			},
			moveFocusSceneLeft = function () {
				moveSceneLeft(templateParent.find('.activated-scene'));
			},
			moveFocusSceneRight = function () {
				moveSceneRight(templateParent.find('.activated-scene'));
			},
			insideWidget = function (e) {
				if (!e.gesture || !e.gesture.center) {
					return false;
				}
				var offset = element.offset(),
					left = e.gesture.center.pageX - offset.left,
					top =  e.gesture.center.pageY - offset.top;
				return left > 0 && left < element.width() && top > 0 && top < element.height();
			},
			potentialDropTargets = function (dropPosition, includeActivated) {
				var scenes = includeActivated ? templateParent.find('[data-mm-role=scene]').not('.drag-shadow') : templateParent.find('[data-mm-role=scene]').not('.activated-scene').not('.drag-shadow'),
					row = _.filter(scenes, function (sceneDOM) {
						var scene = jQuery(sceneDOM),
							ypos = dropPosition.top - scene.offset().top,
							sceneHeight =  scene.outerHeight(true),
							withinRow = (ypos > 0 && ypos < sceneHeight);
						return withinRow;
					}),
					potentialRight = _.filter(row, function (sceneDOM) {
						var scene = jQuery(sceneDOM),
							xpos = dropPosition.left - scene.offset().left,
							sceneWidth = scene.outerWidth(true),
							leftMatch = (xpos > -40 && xpos < sceneWidth / 3);
						return leftMatch;
					}),
					potentialLeft = _.filter(row, function (sceneDOM) {
						var scene = jQuery(sceneDOM),
							xpos = dropPosition.left - scene.offset().left,
							sceneWidth = scene.outerWidth(true),
							rightMatch = (xpos > sceneWidth * 2 / 3 && xpos < sceneWidth + 40);
						return rightMatch;
					}),
					lastInRow = jQuery(_.last(row)),
					lastScene = scenes.last();
				if (potentialLeft.length === 0 && potentialRight.length === 0) {
					if (lastInRow.length > 0 && dropPosition.left > lastInRow.offset().left + lastInRow.width()) {
						potentialLeft = lastInRow;
					} else if (lastScene.length > 0 && dropPosition.top > lastScene.offset().top) {
						potentialLeft = lastScene;
					}
				}
				return {left: _.first(potentialLeft), right: _.first(potentialRight)};
			},
			rebuildStoryboard = function () {
				var scenes = storyboardModel.getScenes();
				templateParent.empty();
				if (scenes && scenes.length) {
					_.each(scenes, function (scene) {
						addScene(scene, true);
					});
				} else {
					noScenes.appendTo(templateParent).show();
				}
			},
			lastSceneBefore = function (sceneIndex) {
				var scenesBefore =  _.reject(templateParent.children(), function (sceneDOM) {
						return !jQuery(sceneDOM).data('scene') || sceneIndex < jQuery(sceneDOM).data('scene').index;
					});
				return _.last(scenesBefore);
			},
			addScene = function (scene, appendToEnd, hasFocus) {
				var newScene = template.clone()
					.data('scene', scene)
					.attr({
						'data-mm-role': 'scene',
						'data-mm-idea-id': scene.ideaId,
						'data-mm-index': scene.index,
						'tabindex': 1
					})
					.on('focus', function () {
						templateParent.find('[data-mm-role=scene]').removeClass('activated-scene');
						newScene.addClass('activated-scene');

					})
					.on('tap', function () {
						mapModel.focusAndSelect(scene.ideaId);
					})
					.keydown('del backspace', function (event) {
						storyboardController.removeScene(scene);
						event.preventDefault();
						event.stopPropagation();
					})
					.keydown('meta+right ctrl+right', function () {
						moveSceneRight(jQuery(this));
					})
					.keydown('meta+left ctrl+left', function () {
						moveSceneLeft(jQuery(this));
					})
					.keydown('right', function () {
						jQuery(this).next().focus();
					})
					.keydown('left', function () {
						jQuery(this).prev().focus();
					})
					.keydown('up', function () {
						jQuery(this).gridUp().focus();
					})
					.on('doubletap', function () {
						mapModel.focusAndSelect(scene.ideaId);
						mapModel.editNode(scene.ideaId);
					})
					.keydown('down', function () {
						jQuery(this).gridDown().focus();
					}).shadowDraggable().on('mm:cancel-dragging', function () {
						jQuery(this).siblings().removeClass('potential-drop-left potential-drop-right');
					}).on('mm:stop-dragging', function () {
						var dropTarget = jQuery(this),
							potentialLeft = dropTarget.parent().find('.potential-drop-left'),
							potentialRight = dropTarget.parent().find('.potential-drop-right');
						if (potentialLeft && potentialLeft[0]) {
							storyboardController.moveSceneAfter(dropTarget.data('scene'), potentialLeft.data('scene'));
						} else if (potentialRight && potentialRight[0]) {
							potentialLeft = potentialRight.prev();
							if (potentialLeft && potentialLeft[0]) {
								storyboardController.moveSceneAfter(dropTarget.data('scene'), potentialLeft.data('scene'));
							} else {
								storyboardController.moveSceneAfter(dropTarget.data('scene'));
							}
						}
						jQuery(this).siblings().removeClass('potential-drop-left potential-drop-right');
					}).on('mm:drag', function (e) {
						if (e && e.gesture && e.gesture.center) {
							var potentialDrops = potentialDropTargets({left: e.gesture.center.pageX, top: e.gesture.center.pageY}),
								active = jQuery(this),
								actualLeft,
								actualRight;

							if (potentialDrops.left) {
								actualLeft = jQuery(potentialDrops.left).not(active).not(active.prev());
								actualRight = actualLeft.next();
							} else if (potentialDrops.right) {
								actualRight = jQuery(potentialDrops.right).not(active).not(active.next());
								actualLeft = actualRight.prev();
							}
							active.siblings().not(actualLeft).removeClass('potential-drop-left');
							active.siblings().not(actualRight).removeClass('potential-drop-right');
							if (actualRight) {
								actualRight.addClass('potential-drop-right');
							}
							if (actualLeft) {
								actualLeft.addClass('potential-drop-left');
							}
						}
					}),
					target = !appendToEnd && lastSceneBefore(scene.index);
				noScenes.detach();
				newScene.hide();
				if (target) {
					newScene.insertAfter(target);
				} else if (appendToEnd) {
					newScene.appendTo(templateParent);
				} else {
					newScene.prependTo(templateParent);
				}
				newScene.updateScene(scene, dimensionProvider);
				if (!appendToEnd) {
					newScene.finish();
					newScene.fadeIn({duration: 100, complete: function () {
						if (hasFocus) {
							newScene.focus();
						} else {
							newScene.scrollSceneIntoFocus();
						}
					}});
				} else {
					newScene.show();
				}
			},
			findScene = function (scene) {
				return templateParent.find('[data-mm-role=scene][data-mm-index="' + scene.index + '"][data-mm-idea-id="' + scene.ideaId + '"]');
			},
			removeScene = function (scene) {
				var sceneJQ = findScene(scene),
					hasFocus = sceneJQ.is(':focus'),
					isActive = sceneJQ.hasClass('activated-scene'),
					sibling;
				if (hasFocus || isActive) {
					sibling = sceneJQ.prev();
					if (sibling.length === 0) {
						sibling = sceneJQ.next();
					}
					if (hasFocus) {
						sibling.focus();
					} else if (isActive && jQuery(':focus').length === 0) {
						sibling.focus();
					}
				}
				sceneJQ.finish();
				sceneJQ.fadeOut({duration: 100, complete: function () {
					sceneJQ.remove();
				}});
			},
			updateScene = function (scene) {
				findScene(scene).updateScene(scene, dimensionProvider);
			},
			moveScene = function (moved) {
				var oldScene = findScene(moved.from),
					hasFocus = oldScene.is(':focus');
				oldScene.finish();
				oldScene.fadeOut({duration: 100, complete: function () {
					oldScene.remove();
					addScene(moved.to, false, hasFocus);
				}});
			},
			showStoryboard = function () {
				storyboardModel.setInputEnabled(true);
				rebuildStoryboard();
				storyboardModel.addEventListener('storyboardSceneAdded', addScene);
				storyboardModel.addEventListener('storyboardSceneMoved', moveScene);
				storyboardModel.addEventListener('storyboardSceneRemoved', removeScene);
				storyboardModel.addEventListener('storyboardSceneContentUpdated', updateScene);
			},
			hideStoryboard = function () {
				storyboardModel.setInputEnabled(false);
				storyboardModel.removeEventListener('storyboardSceneAdded', addScene);
				storyboardModel.removeEventListener('storyboardSceneMoved', moveScene);
				storyboardModel.removeEventListener('storyboardSceneRemoved', removeScene);
				storyboardModel.removeEventListener('storyboardSceneContentUpdated', updateScene);

			};
		template.detach();
		element.find('[data-mm-role=storyboard-remove-scene]').click(removeSelectedScenes);
		element.find('[data-mm-role=storyboard-move-scene-left]').click(moveFocusSceneLeft);
		element.find('[data-mm-role=storyboard-move-scene-right]').click(moveFocusSceneRight);
		/*jshint newcap:false*/
		element.on('show', showStoryboard).on('hide', hideStoryboard);

		element.parents('[data-drag-role=container]').on('mm:drag', function (e) {
			if (!insideWidget(e)) {
				templateParent.find('[data-mm-role=scene]').removeClass('potential-drop-left potential-drop-right');
				return;
			}
			if (jQuery(e.target).attr('data-mapjs-role') === 'node') {
				var potentialDrops = potentialDropTargets({left: e.gesture.center.pageX, top: e.gesture.center.pageY}, true),
					actualLeft,
					actualRight,
					scenes = templateParent.find('[data-mm-role=scene]');

				if (potentialDrops.left) {
					actualLeft = jQuery(potentialDrops.left);
					actualRight = actualLeft.next();
				} else if (potentialDrops.right) {
					actualRight = jQuery(potentialDrops.right);
					actualLeft = actualRight.prev();
				}
				scenes.not(actualLeft).removeClass('potential-drop-left');
				scenes.not(actualRight).removeClass('potential-drop-right');
				if (actualRight) {
					actualRight.addClass('potential-drop-right');
				}
				if (actualLeft) {
					actualLeft.addClass('potential-drop-left');
				}
			}
		}).on('mm:stop-dragging', function (e) {
			var target = jQuery(e.target), potentialRight;
			if (target.attr('data-mapjs-role') === 'node') {
				if (insideWidget(e)) {
					potentialRight = templateParent.find('.potential-drop-right');
					storyboardController.addScene(target.data('nodeId'), potentialRight && potentialRight.data('scene'));
				}
			}
			templateParent.children().removeClass('potential-drop-left potential-drop-right');
		}).on('mm:cancel-dragging', function () {
			templateParent.children().removeClass('potential-drop-left potential-drop-right');
		});

	});
};

jQuery.fn.storyboardKeyHandlerWidget = function (storyboardController, storyboardModel, mapModel, addSceneHotkey) {
	'use strict';
	var element = this,
		addSceneHandler = function (evt) {
		var unicode = evt.charCode || evt.keyCode,
			actualkey = String.fromCharCode(unicode);
		if (actualkey === addSceneHotkey && mapModel.getInputEnabled()) {
			mapModel.applyToActivated(function (nodeId) {
				storyboardController.addScene(nodeId);
			});
		}
	};
	storyboardModel.addEventListener('inputEnabled', function (isEnabled) {
		if (isEnabled) {
			element.on('keypress', addSceneHandler);
		} else {
			element.off('keypress', addSceneHandler);
		}
	});
	return element;
};

jQuery.fn.storyboardMenuWidget = function (storyboardController, storyboardModel, mapModel) {
	'use strict';
	var elements = this,
		setVisibility  = function (isEnabled) {
			if (isEnabled) {
				elements.show();
			} else {
				elements.hide();
			}
		};
	elements.find('[data-mm-role=storyboard-add-scene]').click(function () {
		mapModel.applyToActivated(function (nodeId) {
			storyboardController.addScene(nodeId);
		});
	});
	elements.find('[data-mm-role=storyboard-add-scene-children]').click(function () {
		mapModel.applyToActivated(function (nodeId) {
			storyboardController.addScene(nodeId, false, 'with-children');
		});
	});
	elements.find('[data-mm-role=storyboard-remove-scenes-for-idea-id]').click(function () {
		storyboardController.removeScenesForIdeaId(mapModel.getSelectedNodeId());
	});

	storyboardModel.addEventListener('inputEnabled', setVisibility);
	setVisibility(storyboardModel.getInputEnabled());
	return elements;
};
/*


 storyboard widget on shown -> notify controller that storyboard is active
 storyboard widget on hide -> notify controller that storyboard is no longer active

 controller -> model -> active storyboard -> event published

 model event -> addSceneWidget
	- attach/detach keyboard addSceneHandler
	- hide/show menu items
*/

/*global MM, MAPJS, _, $, jQuery*/
MM.exportIdeas = function (contentAggregate, exporter) {
	'use strict';
	var traverse = function (iterator, idea, level) {
		level = level || 0;
		iterator(idea, level);
		_.each(idea.sortedSubIdeas(), function (subIdea) {
			traverse(iterator, subIdea, level + 1);
		});
	};
	if (exporter.begin) {
		exporter.begin();
	}
	traverse(exporter.each, contentAggregate);
	if (exporter.end) {
		exporter.end();
	}
	return exporter.contents();
};
MM.TabSeparatedTextExporter = function () {
	'use strict';
	var contents = [];
	this.contents = function () {
		return contents.join('\n');
	};
	this.each = function (idea, level) {
		contents.push(
			_.map(_.range(level), function () {
				return '\t';
			}).join('') + idea.title.replace(/\t|\n|\r/g, ' ')
		);
	};
};
MM.HtmlTableExporter = function () {
	'use strict';
	var result;
	this.begin = function () {
		result = $('<table>').wrap('<div></div>'); /*parent needed for html generation*/
	};
	this.contents = function () {
		return '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"> </head><body>' +
			$(result).parent().html() +
			'</body></html>';
	};
	this.each = function (idea, level) {
		var row = $('<tr>').appendTo(result),
			cell = $('<td>').appendTo(row).text(idea.title);
		if (idea.attr && idea.attr.style && idea.attr.style.background) {
			cell.css('background-color', idea.attr.style.background);
			cell.css('color', MAPJS.contrastForeground(idea.attr.style.background));
		}
		if (level > 0) {
			$('<td>').prependTo(row).html('&nbsp;').attr('colspan', level);
		}
	};
};
MM.exportToHtmlDocument = function (idea) {
	'use strict';
	var deferred = jQuery.Deferred(),
		createContent = function () {
			var result = $('<div>'), /*parent needed for html generation*/
				appendLinkOrText = function (element, text) {
					if (MAPJS.URLHelper.containsLink(text)) {
						$('<a>').attr('href', MAPJS.URLHelper.getLink(text))
							.text(MAPJS.URLHelper.stripLink(text) || text)
							.appendTo(element);
					} else {
						element.text(text);
					}
				},
				appendAttachment = function (element, anIdea) {
					var attachment = anIdea && anIdea.attr && anIdea.attr.attachment;
					if (attachment && attachment.contentType === 'text/html') {
						$('<div>').addClass('attachment').appendTo(element).html(attachment.content);
					}
				},
				toList = function (ideaList) {
					var list = $('<ul>');
					_.each(ideaList, function (subIdea) {
						var element = $('<li>').appendTo(list);
						appendLinkOrText(element, subIdea.title);
						appendAttachment(element, subIdea);
						if (subIdea.attr && subIdea.attr.style && subIdea.attr.style.background) {
							element.css('background-color', subIdea.attr.style.background);
							element.css('color', MAPJS.contrastForeground(subIdea.attr.style.background));
						}
						if (!_.isEmpty(subIdea.ideas)) {
							toList(subIdea.sortedSubIdeas()).appendTo(element);
						}
					});
					return list;
				},
				heading = $('<h1>').appendTo(result);
			appendLinkOrText(heading, idea.title);
			appendAttachment(result, idea);
			if (!_.isEmpty(idea.ideas)) {
				toList(idea.sortedSubIdeas()).appendTo(result);
			}
			deferred.resolve('<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
				'<style type="text/css">' +
				'body{font-family:"HelveticaNeue",Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#333333;margin-left:10%;margin-right:10%;}h1{display:block;font-size:38.5px;line-height:40px;font-family:inherit;}li{line-height:20px;padding-left:10px;}ul{list-style-type:none;}div.attachment{border:1px solid black;margin:5px;padding:5px;}img.mapimage{border:1px solid black;max-height:600px;max-width:600px;}</style>' +
				'</head><body>' +
				$(result).html() +
				'</body></html>', 'text/html');
		};
	createContent();
	return deferred.promise();
};
MM.exportTableToText = function (table) {
	'use strict';
	return _.map(table, function (row) {
		return _.map(row, function (cell) {
			if (!cell) {
				return '';
			}
			return cell.toString().replace(/\t|\n|\r/g, ' ');
		}).join('\t');
	})
		.join('\n');
};

/*global jQuery*/
jQuery.fn.titleUpdateWidget = function (mapController) {
	'use strict';
	var elements = this;
	mapController.addEventListener('mapLoaded mapSaved', function (id, contentAggregate) {
		if (elements.prop('title')) {
			elements.prop('title', contentAggregate.title);
		}
	});
};

/*global $, window*/
$.fn.toggleClassWidget = function () {
	'use strict';
	var element = this;
	element.filter('[data-mm-key]').each(function () {
		var button = $(this);
		$(window).keydown(button.data('mm-key'), function (evt) {
			button.click();
			evt.preventDefault();
		});
	});
	element.click(function () {
		var target = $($(this).data('mm-target')),
			targetClass = $(this).data('mm-class');
		target.toggleClass(targetClass);
	});
	return element;
};

/*global jQuery*/
jQuery.fn.welcomeMessageWidget = function (activityLog) {
	'use strict';
	return this.each(function () {
		activityLog.log('Welcome Message', 'show', jQuery(this).data('message'));
	});
};

/*jslint nomen: true*/
/*global _gaq, document, jQuery, MM, MAPJS, window, _*/
MM.main = function (config) {
	'use strict';
	var getStorage = function () {
			try {
				window.localStorage.setItem('testkey', 'testval');
				if (window.localStorage.getItem('testkey') === 'testval') {

					return window.localStorage;
				}
			} catch (e) {
			}
			return {
				fake: true,
				getItem: function (key) {
					return this[key];
				},
				setItem: function (key, val) {
					this[key] = val;
				},
				removeItem: function (key) {
					delete this[key];
				}
			};
		},
		browserStorage = config.storage || getStorage(),
		mapModelAnalytics = false,
		setupTracking = function (activityLog, mapModel) {
			activityLog.addEventListener('log', function () {
				// jscs:disable disallowDanglingUnderscores
				_gaq.push(['_trackEvent'].concat(Array.prototype.slice.call(arguments, 0, 3)));
				// jscs:enable disallowDanglingUnderscores
			});
			activityLog.addEventListener('timer', function (category, action, time) {
				// jscs:disable disallowDanglingUnderscores
				_gaq.push(['_trackEvent', category,  action, '', time]);
				// jscs:enable disallowDanglingUnderscores
			});
			if (mapModelAnalytics) {
				mapModel.addEventListener('analytic', activityLog.log);
			}
		};
	// jscs:disable disallowDanglingUnderscores
	window._gaq = window._gaq || [];

	window._gaq = [['_setAccount', config.googleAnalyticsAccount],
		['_setCustomVar', 1, 'User Cohort', config.userCohort, 1],
		['_setCustomVar', 2, 'Active Extensions', browserStorage['active-extensions'], 1],
		['_trackPageview']
			].concat(window._gaq);
	// jscs:enable disallowDanglingUnderscores
	jQuery(function () {
		var activityLog = new MM.ActivityLog(10000),
			oldShowPalette,
			s3Api = new MM.S3Api(),
			alert = new MM.Alert(),
			goldFunnelModel = new MM.GoldFunnelModel(activityLog),
			modalConfirm = jQuery('#modalConfirm').modalConfirmWidget(),
			objectStorage = new MM.JsonStorage(browserStorage),
			ajaxPublishingConfigGenerator = new MM.S3ConfigGenerator(config.s3Url, config.publishingConfigUrl, config.s3Folder),
			goldLicenseManager = new MM.GoldLicenseManager(objectStorage, 'licenseKey'),
			goldApi = new MM.GoldApi(goldLicenseManager, config.goldApiUrl, activityLog, config.goldBucketName),
			goldStorage = new MM.GoldStorage(goldApi, s3Api, modalConfirm),
			s3FileSystem = new MM.S3FileSystem(ajaxPublishingConfigGenerator, 'a', 'S3_CORS'),
			googleAuthenticator = new MM.GoogleAuthenticator(config.googleClientId, config.googleApiKey),
			googleDriveAdapter = new MM.GoogleDriveAdapter(googleAuthenticator, config.googleAppId, config.networkTimeoutMillis, 'application/json'),
            resourcePrefix = 'internal',
            resourceCompressor = new MM.ResourceCompressor(resourcePrefix),
			mapController = new MM.MapController([
				new MM.RetriableMapSourceDecorator(new MM.FileSystemMapSource(s3FileSystem, resourceCompressor.compress)),
				new MM.RetriableMapSourceDecorator(new MM.FileSystemMapSource(goldStorage.fileSystemFor('b'), resourceCompressor.compress)),
				new MM.RetriableMapSourceDecorator(new MM.FileSystemMapSource(goldStorage.fileSystemFor('p'), resourceCompressor.compress)),
				new MM.RetriableMapSourceDecorator(new MM.FileSystemMapSource(googleDriveAdapter, resourceCompressor.compress)),
				new MM.EmbeddedMapSource(config.newMapProperties)
			]),
			activeContentListener = new MM.ActiveContentListener(mapController),
			activeContentResourceManager = new MM.ActiveContentResourceManager(activeContentListener, resourcePrefix),
			objectClipboard = new MM.LocalStorageClipboard(objectStorage, 'clipboard', alert, activeContentResourceManager),
			navigation = MM.navigation(browserStorage, mapController),
			mapModel = new MAPJS.MapModel(MAPJS.DOMRender.layoutCalculator, ['Press Space or double-click to edit'], objectClipboard),
			storyboardModel = new MM.StoryboardModel(activeContentListener, 'storyboards', 'storyboard-scenes'),
			storyboardDimensionProvider = new MM.StoryboardDimensionProvider(activeContentResourceManager),
			sharePostProcessing = MM.buildDecoratedResultProcessor(MM.ajaxResultProcessor, MM.layoutExportDecorators),
			sendPostProcessing = MM.buildDecoratedResultProcessor(function (result) {
					return jQuery.Deferred().resolve(result);
				}, MM.sendExportDecorators),
			contentExporter = MM.buildMapContentExporter(activeContentListener, activeContentResourceManager.getResource),
			layoutExportController = new MM.LayoutExportController({
				'png': MM.buildMapLayoutExporter(mapModel, activeContentResourceManager.getResource),
				'pdf': MM.buildMapLayoutExporter(mapModel, activeContentResourceManager.getResource),
				'presentation.pdf':  {exporter: MM.buildStoryboardExporter(storyboardModel, storyboardDimensionProvider, activeContentResourceManager.getResource), processor: sendPostProcessing},
				'presentation.pptx': {exporter: MM.buildStoryboardExporter(storyboardModel, storyboardDimensionProvider, activeContentResourceManager.getResource), processor: sendPostProcessing},
				'storyboard.docx':  {exporter: MM.buildStoryboardExporter(storyboardModel, storyboardDimensionProvider, activeContentResourceManager.getResource), processor: sendPostProcessing},
				'publish.json': { exporter: contentExporter, processor: sharePostProcessing},
				'outline.docx':  { exporter:  contentExporter, processor: sendPostProcessing },
				'outline.md':  { exporter: contentExporter, processor: sendPostProcessing },
				'outline.txt':  { exporter: contentExporter, processor: sendPostProcessing }
			}, goldApi, s3Api, activityLog, goldFunnelModel),
			iconEditor = new MM.iconEditor(mapModel, activeContentResourceManager),
			mapBookmarks = new MM.Bookmark(mapController, objectStorage, 'created-maps'),
			autoSave = new MM.AutoSave(mapController, objectStorage, alert, mapModel),
			stageImageInsertController = new MAPJS.ImageInsertController(config.corsProxyUrl, activeContentResourceManager.storeResource),
			measuresModel = new MM.MeasuresModel('measurements-config', 'measurements', activeContentListener, new MM.MeasuresModel.ActivatedNodesFilter(mapModel)),
			splittableController = new MM.SplittableController(jQuery('body'), mapModel, browserStorage, 'splittableController', 'measuresSheet'),
			customStyleController = new MM.CustomStyleController(activeContentListener, mapModel),
			storyboardController = new MM.StoryboardController(storyboardModel),
			collaborationModel = new MM.CollaborationModel(mapModel),
			extensions = new MM.Extensions(browserStorage, 'active-extensions', config, {
				'googleDriveAdapter': googleDriveAdapter,
				'alert': alert,
				'mapController': mapController,
				'activityLog': activityLog,
				'mapModel': mapModel,
				'container': jQuery('#container'),
				'iconEditor': iconEditor,
				'measuresModel' : measuresModel,
				'activeContentListener': activeContentListener,
				'navigation': navigation,
				'collaborationModel': collaborationModel,
				'modalConfirm': modalConfirm
			}),
			loadWidgets = function () {
				var isTouch = jQuery('body').hasClass('ios') || jQuery('body').hasClass('android');
				if (isTouch) {
					jQuery('[data-mm-role-touch]').attr('data-mm-role', function () {
						return jQuery(this).attr('data-mm-role-touch');
					});
				} else {
					jQuery('[rel=tooltip]').tooltip();
				}

				MAPJS.DOMRender.stageVisibilityMargin = {top: 50, left: 10, bottom: 20, right: 20};
				MAPJS.DOMRender.stageMargin = {top: 50, left: 50, bottom: 50, right: 50};


				jQuery('[data-mm-layout][data-mm-layout!=' + config.layout + ']').remove();
				jQuery('body').mapStatusWidget(mapController, activeContentListener);
				jQuery('#container').domMapWidget(activityLog, mapModel, isTouch, stageImageInsertController, jQuery('#splittable'), activeContentResourceManager.getResource).storyboardKeyHandlerWidget(storyboardController, storyboardModel, mapModel, '+');
				jQuery('#welcome_message[data-message]').welcomeMessageWidget(activityLog);
				jQuery('#topbar').mapToolbarWidget(mapModel);
				oldShowPalette = jQuery.fn.colorPicker.showPalette;
				jQuery.fn.colorPicker.showPalette = function (palette) {
					oldShowPalette(palette);
					if (palette.hasClass('topbar-color-picker')) {
						palette.css('top', jQuery('#topbar').outerHeight());
					}
				};
				jQuery('#toolbarEdit').mapToolbarWidget(mapModel);
				jQuery('#floating-toolbar').floatingToolbarWidget();
				jQuery('#floating-collaborators').floatingToolbarWidget();
				jQuery('#listBookmarks').bookmarkWidget(mapBookmarks, alert, mapController);
				jQuery(document).titleUpdateWidget(mapController);

				jQuery('[data-mm-role=share-google]').googleShareWidget(mapController, googleDriveAdapter);
				jQuery('#modalImport').importWidget(activityLog, mapController);
				jQuery('[data-mm-role=save]').saveWidget(mapController);
				jQuery('[data-mm-role="toggle-class"]').toggleClassWidget();
				jQuery('[data-mm-role="remote-export"]').remoteExportWidget(mapController, alert, measuresModel, goldApi, s3Api, modalConfirm);
				jQuery('[data-mm-role~=layout-export]').layoutExportWidget(layoutExportController);
				jQuery('#modalPresentationExport').sendToGoogleDriveWidget(googleDriveAdapter);
				jQuery('#modalOutlineExport').sendToGoogleDriveWidget(googleDriveAdapter);
				jQuery('[data-mm-role~=atlas-publish]').atlasPrepopulationWidget(activeContentListener, 40, 150);
				jQuery('[data-mm-role~=google-drive-open]').googleDriveOpenWidget(googleDriveAdapter, mapController, modalConfirm, activityLog);
				jQuery('#modalGoldStorageOpen').goldStorageOpenWidget(goldStorage, mapController);
				jQuery('body')
					.commandLineWidget('Shift+Space Ctrl+Space', mapModel)
					.searchWidget('Meta+F Ctrl+F', mapModel);
				jQuery('#modalAttachmentEditor').attachmentEditorWidget(mapModel, isTouch);
				jQuery('#modalAutoSave').autoSaveWidget(autoSave);
				jQuery('#linkEditWidget').linkEditWidget(mapModel);
				jQuery('#modalExtensions').extensionsWidget(extensions, mapController, alert);
				jQuery('#nodeContextMenu').contextMenuWidget(mapModel).mapToolbarWidget(mapModel);
				jQuery('.dropdown-submenu>a').click(function () {
					return false;
				});
				jQuery('[data-category]').trackingWidget(activityLog);
				jQuery('#modalKeyActions').keyActionsWidget();
				jQuery('#topbar .updateStyle').attr('data-mm-align', 'top').colorPicker();
				jQuery('.colorPicker-palette').addClass('topbar-color-picker');
				jQuery('.updateStyle[data-mm-align!=top]').colorPicker();
				jQuery('.colorPicker-picker').parent('a,button').click(function (e) {
					if (e.target === this) {
						jQuery(this).find('.colorPicker-picker').click();
					}
				});
				jQuery('#modalGoldLicense').goldLicenseEntryWidget(goldLicenseManager, goldApi, activityLog, window, googleAuthenticator, goldFunnelModel);
				jQuery('#modalIconEdit').iconEditorWidget(iconEditor, config.corsProxyUrl);
				jQuery('#measuresSheet').measuresSheetWidget(measuresModel);
				jQuery('[data-mm-role=measures-display-control]').measuresDisplayControlWidget(measuresModel, mapModel);
				jQuery('.modal.huge').scalableModalWidget();
				jQuery('[data-mm-role=new-from-clipboard]').newFromClipboardWidget(objectClipboard, mapController, resourceCompressor);
				MM.setImageAlertWidget(stageImageInsertController, alert);
				jQuery('#anon-alert-template').anonSaveAlertWidget(alert, mapController, s3FileSystem, browserStorage, 'anon-alert-disabled');
				jQuery('[data-mm-role="legacy-alert"]').legacyAlertWidget(browserStorage, 'legacy-alert-disabled', jQuery('body'), alert);
				jQuery('body').splitFlipWidget(splittableController, '[data-mm-role=split-flip]', mapModel, 'Alt+o');
				jQuery('#storyboard').storyboardWidget(storyboardController, storyboardModel, storyboardDimensionProvider, mapModel);
				jQuery('[data-mm-role=storyboard-menu]').storyboardMenuWidget(storyboardController, storyboardModel, mapModel);

				/* needs to come after all optional content widgets to fire show events */
				jQuery('[data-mm-role=optional-content]').optionalContentWidget(mapModel, splittableController);

				jQuery('#customStyleModal').customStyleWidget(customStyleController);
				jQuery('[data-mm-role~=new-map]').newMapWidget(mapController);
				jQuery('#container').collaboratorPhotoWidget(collaborationModel, MM.deferredImageLoader, 'mm-collaborator');
				jQuery('#floating-collaborators').collaboratorListWidget(collaborationModel, 'mm-has-collaborators');
				jQuery('.modal').modalLauncherWidget(mapModel);
				jQuery('input[data-mm-role~=selectable-read-only]').selectableReadOnlyInputWidget();
				jQuery('textarea[data-mm-role~=selectable-read-only]').selectableReadOnlyInputWidget();

				jQuery('#collaboratorSpeechBubble').collaboratorSpeechBubbleWidget(collaborationModel);
			};
		config.activeContentConfiguration = {
			nonClonedAttributes: ['storyboards', 'storyboard-scenes', 'measurements-config']
		};
		jQuery.fn.colorPicker.defaults.colors = [
			'000000', '993300', '333300', '000080', '333399', '333333', '800000', 'FF6600',
			'808000', '008000', '008080', '0000FF', '666699', '808080', 'FF0000', 'FF9900',
			'99CC00', '339966', '33CCCC', '3366FF', '800080', '999999', 'FF00FF', 'FFCC00',
			'FFFF00', '00FF00', '00FFFF', '00CCFF', '993366', 'C0C0C0', 'FF99CC', 'FFCC99',
			'FFFF99', 'CCFFFF', 'FFFFFF', 'transparent'
		];
		jQuery.fn.colorPicker.defaults.pickerDefault = 'transparent';
		jQuery.support.cors = true;
		setupTracking(activityLog, mapModel);
		jQuery('body').classCachingWidget('cached-classes', browserStorage);
		MM.MapController.activityTracking(mapController, activityLog);
		MM.MapController.alerts(mapController, alert, modalConfirm);
		MM.measuresModelMediator(mapModel, measuresModel);
		mapController.addEventListener('mapLoaded', function (mapId, idea) {
			idea.setConfiguration(config.activeContentConfiguration);
			mapModel.setIdea(idea);
		});
		if (browserStorage.fake) {
			alert.show('Browser storage unavailable!', 'You might be running the app in private mode or have no browser storage - some features of this application will not work fully.', 'warning');
			activityLog.log('Warning', 'Local storage not available');
		}
		jQuery('#topbar').alertWidget(alert);
		if (window.mmtimestamp) {
			window.mmtimestamp.log('mm initialized');
		}

		_.each(jQuery('a'), function (l) {
			if (/^mailto:/.test(l.href)) {
				l.target = 'mailtoIframe';
			}
		});

		extensions.load(navigation.initialMapId()).then(function () {
			if (window.mmtimestamp) {
				window.mmtimestamp.log('extensions loaded');
			}
			jQuery('[data-mm-clone]').each(function () {
				var element = jQuery(this),
					toClone = jQuery(element.data('mm-clone'));
				toClone.children().clone(true).appendTo(element);
				element.attr('data-mm-role', toClone.attr('data-mm-role'));
			});
			loadWidgets();
			if (window.mmtimestamp) {
				window.mmtimestamp.log('ui loaded');
			}
			if (!navigation.loadInitial()) {
				jQuery('#logo-img').click();
			}
		});
	});

};
