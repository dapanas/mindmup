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

/*!
* Bootstrap.js by @fat & @mdo
* Copyright 2012 Twitter, Inc.
* http://www.apache.org/licenses/LICENSE-2.0.txt
*/
!function(e){"use strict";e(function(){e.support.transition=function(){var e=function(){var e=document.createElement("bootstrap"),t={WebkitTransition:"webkitTransitionEnd",MozTransition:"transitionend",OTransition:"oTransitionEnd otransitionend",transition:"transitionend"},n;for(n in t)if(e.style[n]!==undefined)return t[n]}();return e&&{end:e}}()})}(window.jQuery),!function(e){"use strict";var t='[data-dismiss="alert"]',n=function(n){e(n).on("click",t,this.close)};n.prototype.close=function(t){function s(){i.trigger("closed").remove()}var n=e(this),r=n.attr("data-target"),i;r||(r=n.attr("href"),r=r&&r.replace(/.*(?=#[^\s]*$)/,"")),i=e(r),t&&t.preventDefault(),i.length||(i=n.hasClass("alert")?n:n.parent()),i.trigger(t=e.Event("close"));if(t.isDefaultPrevented())return;i.removeClass("in"),e.support.transition&&i.hasClass("fade")?i.on(e.support.transition.end,s):s()};var r=e.fn.alert;e.fn.alert=function(t){return this.each(function(){var r=e(this),i=r.data("alert");i||r.data("alert",i=new n(this)),typeof t=="string"&&i[t].call(r)})},e.fn.alert.Constructor=n,e.fn.alert.noConflict=function(){return e.fn.alert=r,this},e(document).on("click.alert.data-api",t,n.prototype.close)}(window.jQuery),!function(e){"use strict";var t=function(t,n){this.$element=e(t),this.options=e.extend({},e.fn.button.defaults,n)};t.prototype.setState=function(e){var t="disabled",n=this.$element,r=n.data(),i=n.is("input")?"val":"html";e+="Text",r.resetText||n.data("resetText",n[i]()),n[i](r[e]||this.options[e]),setTimeout(function(){e=="loadingText"?n.addClass(t).attr(t,t):n.removeClass(t).removeAttr(t)},0)},t.prototype.toggle=function(){var e=this.$element.closest('[data-toggle="buttons-radio"]');e&&e.find(".active").removeClass("active"),this.$element.toggleClass("active")};var n=e.fn.button;e.fn.button=function(n){return this.each(function(){var r=e(this),i=r.data("button"),s=typeof n=="object"&&n;i||r.data("button",i=new t(this,s)),n=="toggle"?i.toggle():n&&i.setState(n)})},e.fn.button.defaults={loadingText:"loading..."},e.fn.button.Constructor=t,e.fn.button.noConflict=function(){return e.fn.button=n,this},e(document).on("click.button.data-api","[data-toggle^=button]",function(t){var n=e(t.target);n.hasClass("btn")||(n=n.closest(".btn")),n.button("toggle")})}(window.jQuery),!function(e){"use strict";var t=function(t,n){this.$element=e(t),this.$indicators=this.$element.find(".carousel-indicators"),this.options=n,this.options.pause=="hover"&&this.$element.on("mouseenter",e.proxy(this.pause,this)).on("mouseleave",e.proxy(this.cycle,this))};t.prototype={cycle:function(t){return t||(this.paused=!1),this.interval&&clearInterval(this.interval),this.options.interval&&!this.paused&&(this.interval=setInterval(e.proxy(this.next,this),this.options.interval)),this},getActiveIndex:function(){return this.$active=this.$element.find(".item.active"),this.$items=this.$active.parent().children(),this.$items.index(this.$active)},to:function(t){var n=this.getActiveIndex(),r=this;if(t>this.$items.length-1||t<0)return;return this.sliding?this.$element.one("slid",function(){r.to(t)}):n==t?this.pause().cycle():this.slide(t>n?"next":"prev",e(this.$items[t]))},pause:function(t){return t||(this.paused=!0),this.$element.find(".next, .prev").length&&e.support.transition.end&&(this.$element.trigger(e.support.transition.end),this.cycle(!0)),clearInterval(this.interval),this.interval=null,this},next:function(){if(this.sliding)return;return this.slide("next")},prev:function(){if(this.sliding)return;return this.slide("prev")},slide:function(t,n){var r=this.$element.find(".item.active"),i=n||r[t](),s=this.interval,o=t=="next"?"left":"right",u=t=="next"?"first":"last",a=this,f;this.sliding=!0,s&&this.pause(),i=i.length?i:this.$element.find(".item")[u](),f=e.Event("slide",{relatedTarget:i[0],direction:o});if(i.hasClass("active"))return;this.$indicators.length&&(this.$indicators.find(".active").removeClass("active"),this.$element.one("slid",function(){var t=e(a.$indicators.children()[a.getActiveIndex()]);t&&t.addClass("active")}));if(e.support.transition&&this.$element.hasClass("slide")){this.$element.trigger(f);if(f.isDefaultPrevented())return;i.addClass(t),i[0].offsetWidth,r.addClass(o),i.addClass(o),this.$element.one(e.support.transition.end,function(){i.removeClass([t,o].join(" ")).addClass("active"),r.removeClass(["active",o].join(" ")),a.sliding=!1,setTimeout(function(){a.$element.trigger("slid")},0)})}else{this.$element.trigger(f);if(f.isDefaultPrevented())return;r.removeClass("active"),i.addClass("active"),this.sliding=!1,this.$element.trigger("slid")}return s&&this.cycle(),this}};var n=e.fn.carousel;e.fn.carousel=function(n){return this.each(function(){var r=e(this),i=r.data("carousel"),s=e.extend({},e.fn.carousel.defaults,typeof n=="object"&&n),o=typeof n=="string"?n:s.slide;i||r.data("carousel",i=new t(this,s)),typeof n=="number"?i.to(n):o?i[o]():s.interval&&i.pause().cycle()})},e.fn.carousel.defaults={interval:5e3,pause:"hover"},e.fn.carousel.Constructor=t,e.fn.carousel.noConflict=function(){return e.fn.carousel=n,this},e(document).on("click.carousel.data-api","[data-slide], [data-slide-to]",function(t){var n=e(this),r,i=e(n.attr("data-target")||(r=n.attr("href"))&&r.replace(/.*(?=#[^\s]+$)/,"")),s=e.extend({},i.data(),n.data()),o;i.carousel(s),(o=n.attr("data-slide-to"))&&i.data("carousel").pause().to(o).cycle(),t.preventDefault()})}(window.jQuery),!function(e){"use strict";var t=function(t,n){this.$element=e(t),this.options=e.extend({},e.fn.collapse.defaults,n),this.options.parent&&(this.$parent=e(this.options.parent)),this.options.toggle&&this.toggle()};t.prototype={constructor:t,dimension:function(){var e=this.$element.hasClass("width");return e?"width":"height"},show:function(){var t,n,r,i;if(this.transitioning||this.$element.hasClass("in"))return;t=this.dimension(),n=e.camelCase(["scroll",t].join("-")),r=this.$parent&&this.$parent.find("> .accordion-group > .in");if(r&&r.length){i=r.data("collapse");if(i&&i.transitioning)return;r.collapse("hide"),i||r.data("collapse",null)}this.$element[t](0),this.transition("addClass",e.Event("show"),"shown"),e.support.transition&&this.$element[t](this.$element[0][n])},hide:function(){var t;if(this.transitioning||!this.$element.hasClass("in"))return;t=this.dimension(),this.reset(this.$element[t]()),this.transition("removeClass",e.Event("hide"),"hidden"),this.$element[t](0)},reset:function(e){var t=this.dimension();return this.$element.removeClass("collapse")[t](e||"auto")[0].offsetWidth,this.$element[e!==null?"addClass":"removeClass"]("collapse"),this},transition:function(t,n,r){var i=this,s=function(){n.type=="show"&&i.reset(),i.transitioning=0,i.$element.trigger(r)};this.$element.trigger(n);if(n.isDefaultPrevented())return;this.transitioning=1,this.$element[t]("in"),e.support.transition&&this.$element.hasClass("collapse")?this.$element.one(e.support.transition.end,s):s()},toggle:function(){this[this.$element.hasClass("in")?"hide":"show"]()}};var n=e.fn.collapse;e.fn.collapse=function(n){return this.each(function(){var r=e(this),i=r.data("collapse"),s=e.extend({},e.fn.collapse.defaults,r.data(),typeof n=="object"&&n);i||r.data("collapse",i=new t(this,s)),typeof n=="string"&&i[n]()})},e.fn.collapse.defaults={toggle:!0},e.fn.collapse.Constructor=t,e.fn.collapse.noConflict=function(){return e.fn.collapse=n,this},e(document).on("click.collapse.data-api","[data-toggle=collapse]",function(t){var n=e(this),r,i=n.attr("data-target")||t.preventDefault()||(r=n.attr("href"))&&r.replace(/.*(?=#[^\s]+$)/,""),s=e(i).data("collapse")?"toggle":n.data();n[e(i).hasClass("in")?"addClass":"removeClass"]("collapsed"),e(i).collapse(s)})}(window.jQuery),!function(e){"use strict";function r(){e(t).each(function(){i(e(this)).removeClass("open")})}function i(t){var n=t.attr("data-target"),r;n||(n=t.attr("href"),n=n&&/#/.test(n)&&n.replace(/.*(?=#[^\s]*$)/,"")),r=n&&e(n);if(!r||!r.length)r=t.parent();return r}var t="[data-toggle=dropdown]",n=function(t){var n=e(t).on("click.dropdown.data-api",this.toggle);e("html").on("click.dropdown.data-api",function(){n.parent().removeClass("open")})};n.prototype={constructor:n,toggle:function(t){var n=e(this),s,o;if(n.is(".disabled, :disabled"))return;return s=i(n),o=s.hasClass("open"),r(),o||s.toggleClass("open"),n.focus(),!1},keydown:function(n){var r,s,o,u,a,f;if(!/(38|40|27)/.test(n.keyCode))return;r=e(this),n.preventDefault(),n.stopPropagation();if(r.is(".disabled, :disabled"))return;u=i(r),a=u.hasClass("open");if(!a||a&&n.keyCode==27)return n.which==27&&u.find(t).focus(),r.click();s=e("[role=menu] li:not(.divider):visible a",u);if(!s.length)return;f=s.index(s.filter(":focus")),n.keyCode==38&&f>0&&f--,n.keyCode==40&&f<s.length-1&&f++,~f||(f=0),s.eq(f).focus()}};var s=e.fn.dropdown;e.fn.dropdown=function(t){return this.each(function(){var r=e(this),i=r.data("dropdown");i||r.data("dropdown",i=new n(this)),typeof t=="string"&&i[t].call(r)})},e.fn.dropdown.Constructor=n,e.fn.dropdown.noConflict=function(){return e.fn.dropdown=s,this},e(document).on("click.dropdown.data-api",r).on("click.dropdown.data-api",".dropdown form",function(e){e.stopPropagation()}).on("click.dropdown-menu",function(e){e.stopPropagation()}).on("click.dropdown.data-api",t,n.prototype.toggle).on("keydown.dropdown.data-api",t+", [role=menu]",n.prototype.keydown)}(window.jQuery),!function(e){"use strict";var t=function(t,n){this.options=n,this.$element=e(t).delegate('[data-dismiss="modal"]',"click.dismiss.modal",e.proxy(this.hide,this)),this.options.remote&&this.$element.find(".modal-body").load(this.options.remote)};t.prototype={constructor:t,toggle:function(){return this[this.isShown?"hide":"show"]()},show:function(){var t=this,n=e.Event("show");this.$element.trigger(n);if(this.isShown||n.isDefaultPrevented())return;this.isShown=!0,this.escape(),this.backdrop(function(){var n=e.support.transition&&t.$element.hasClass("fade");t.$element.parent().length||t.$element.appendTo(document.body),t.$element.show(),n&&t.$element[0].offsetWidth,t.$element.addClass("in").attr("aria-hidden",!1),t.enforceFocus(),n?t.$element.one(e.support.transition.end,function(){t.$element.focus().trigger("shown")}):t.$element.focus().trigger("shown")})},hide:function(t){t&&t.preventDefault();var n=this;t=e.Event("hide"),this.$element.trigger(t);if(!this.isShown||t.isDefaultPrevented())return;this.isShown=!1,this.escape(),e(document).off("focusin.modal"),this.$element.removeClass("in").attr("aria-hidden",!0),e.support.transition&&this.$element.hasClass("fade")?this.hideWithTransition():this.hideModal()},enforceFocus:function(){var t=this;e(document).on("focusin.modal",function(e){t.$element[0]!==e.target&&!t.$element.has(e.target).length&&t.$element.focus()})},escape:function(){var e=this;this.isShown&&this.options.keyboard?this.$element.on("keyup.dismiss.modal",function(t){t.which==27&&e.hide()}):this.isShown||this.$element.off("keyup.dismiss.modal")},hideWithTransition:function(){var t=this,n=setTimeout(function(){t.$element.off(e.support.transition.end),t.hideModal()},500);this.$element.one(e.support.transition.end,function(){clearTimeout(n),t.hideModal()})},hideModal:function(){var e=this;this.$element.hide(),this.backdrop(function(){e.removeBackdrop(),e.$element.trigger("hidden")})},removeBackdrop:function(){this.$backdrop&&this.$backdrop.remove(),this.$backdrop=null},backdrop:function(t){var n=this,r=this.$element.hasClass("fade")?"fade":"";if(this.isShown&&this.options.backdrop){var i=e.support.transition&&r;this.$backdrop=e('<div class="modal-backdrop '+r+'" />').appendTo(document.body),this.$backdrop.click(this.options.backdrop=="static"?e.proxy(this.$element[0].focus,this.$element[0]):e.proxy(this.hide,this)),i&&this.$backdrop[0].offsetWidth,this.$backdrop.addClass("in");if(!t)return;i?this.$backdrop.one(e.support.transition.end,t):t()}else!this.isShown&&this.$backdrop?(this.$backdrop.removeClass("in"),e.support.transition&&this.$element.hasClass("fade")?this.$backdrop.one(e.support.transition.end,t):t()):t&&t()}};var n=e.fn.modal;e.fn.modal=function(n){return this.each(function(){var r=e(this),i=r.data("modal"),s=e.extend({},e.fn.modal.defaults,r.data(),typeof n=="object"&&n);i||r.data("modal",i=new t(this,s)),typeof n=="string"?i[n]():s.show&&i.show()})},e.fn.modal.defaults={backdrop:!0,keyboard:!0,show:!0},e.fn.modal.Constructor=t,e.fn.modal.noConflict=function(){return e.fn.modal=n,this},e(document).on("click.modal.data-api",'[data-toggle="modal"]',function(t){var n=e(this),r=n.attr("href"),i=e(n.attr("data-target")||r&&r.replace(/.*(?=#[^\s]+$)/,"")),s=i.data("modal")?"toggle":e.extend({remote:!/#/.test(r)&&r},i.data(),n.data());t.preventDefault(),i.modal(s).one("hide",function(){n.focus()})})}(window.jQuery),!function(e){"use strict";var t=function(e,t){this.init("tooltip",e,t)};t.prototype={constructor:t,init:function(t,n,r){var i,s,o,u,a;this.type=t,this.$element=e(n),this.options=this.getOptions(r),this.enabled=!0,o=this.options.trigger.split(" ");for(a=o.length;a--;)u=o[a],u=="click"?this.$element.on("click."+this.type,this.options.selector,e.proxy(this.toggle,this)):u!="manual"&&(i=u=="hover"?"mouseenter":"focus",s=u=="hover"?"mouseleave":"blur",this.$element.on(i+"."+this.type,this.options.selector,e.proxy(this.enter,this)),this.$element.on(s+"."+this.type,this.options.selector,e.proxy(this.leave,this)));this.options.selector?this._options=e.extend({},this.options,{trigger:"manual",selector:""}):this.fixTitle()},getOptions:function(t){return t=e.extend({},e.fn[this.type].defaults,this.$element.data(),t),t.delay&&typeof t.delay=="number"&&(t.delay={show:t.delay,hide:t.delay}),t},enter:function(t){var n=e.fn[this.type].defaults,r={},i;this._options&&e.each(this._options,function(e,t){n[e]!=t&&(r[e]=t)},this),i=e(t.currentTarget)[this.type](r).data(this.type);if(!i.options.delay||!i.options.delay.show)return i.show();clearTimeout(this.timeout),i.hoverState="in",this.timeout=setTimeout(function(){i.hoverState=="in"&&i.show()},i.options.delay.show)},leave:function(t){var n=e(t.currentTarget)[this.type](this._options).data(this.type);this.timeout&&clearTimeout(this.timeout);if(!n.options.delay||!n.options.delay.hide)return n.hide();n.hoverState="out",this.timeout=setTimeout(function(){n.hoverState=="out"&&n.hide()},n.options.delay.hide)},show:function(){var t,n,r,i,s,o,u=e.Event("show");if(this.hasContent()&&this.enabled){this.$element.trigger(u);if(u.isDefaultPrevented())return;t=this.tip(),this.setContent(),this.options.animation&&t.addClass("fade"),s=typeof this.options.placement=="function"?this.options.placement.call(this,t[0],this.$element[0]):this.options.placement,t.detach().css({top:0,left:0,display:"block"}),this.options.container?t.appendTo(this.options.container):t.insertAfter(this.$element),n=this.getPosition(),r=t[0].offsetWidth,i=t[0].offsetHeight;switch(s){case"bottom":o={top:n.top+n.height,left:n.left+n.width/2-r/2};break;case"top":o={top:n.top-i,left:n.left+n.width/2-r/2};break;case"left":o={top:n.top+n.height/2-i/2,left:n.left-r};break;case"right":o={top:n.top+n.height/2-i/2,left:n.left+n.width}}this.applyPlacement(o,s),this.$element.trigger("shown")}},applyPlacement:function(e,t){var n=this.tip(),r=n[0].offsetWidth,i=n[0].offsetHeight,s,o,u,a;n.offset(e).addClass(t).addClass("in"),s=n[0].offsetWidth,o=n[0].offsetHeight,t=="top"&&o!=i&&(e.top=e.top+i-o,a=!0),t=="bottom"||t=="top"?(u=0,e.left<0&&(u=e.left*-2,e.left=0,n.offset(e),s=n[0].offsetWidth,o=n[0].offsetHeight),this.replaceArrow(u-r+s,s,"left")):this.replaceArrow(o-i,o,"top"),a&&n.offset(e)},replaceArrow:function(e,t,n){this.arrow().css(n,e?50*(1-e/t)+"%":"")},setContent:function(){var e=this.tip(),t=this.getTitle();e.find(".tooltip-inner")[this.options.html?"html":"text"](t),e.removeClass("fade in top bottom left right")},hide:function(){function i(){var t=setTimeout(function(){n.off(e.support.transition.end).detach()},500);n.one(e.support.transition.end,function(){clearTimeout(t),n.detach()})}var t=this,n=this.tip(),r=e.Event("hide");this.$element.trigger(r);if(r.isDefaultPrevented())return;return n.removeClass("in"),e.support.transition&&this.$tip.hasClass("fade")?i():n.detach(),this.$element.trigger("hidden"),this},fixTitle:function(){var e=this.$element;(e.attr("title")||typeof e.attr("data-original-title")!="string")&&e.attr("data-original-title",e.attr("title")||"").attr("title","")},hasContent:function(){return this.getTitle()},getPosition:function(){var t=this.$element[0];return e.extend({},typeof t.getBoundingClientRect=="function"?t.getBoundingClientRect():{width:t.offsetWidth,height:t.offsetHeight},this.$element.offset())},getTitle:function(){var e,t=this.$element,n=this.options;return e=t.attr("data-original-title")||(typeof n.title=="function"?n.title.call(t[0]):n.title),e},tip:function(){return this.$tip=this.$tip||e(this.options.template)},arrow:function(){return this.$arrow=this.$arrow||this.tip().find(".tooltip-arrow")},validate:function(){this.$element[0].parentNode||(this.hide(),this.$element=null,this.options=null)},enable:function(){this.enabled=!0},disable:function(){this.enabled=!1},toggleEnabled:function(){this.enabled=!this.enabled},toggle:function(t){var n=t?e(t.currentTarget)[this.type](this._options).data(this.type):this;n.tip().hasClass("in")?n.hide():n.show()},destroy:function(){this.hide().$element.off("."+this.type).removeData(this.type)}};var n=e.fn.tooltip;e.fn.tooltip=function(n){return this.each(function(){var r=e(this),i=r.data("tooltip"),s=typeof n=="object"&&n;i||r.data("tooltip",i=new t(this,s)),typeof n=="string"&&i[n]()})},e.fn.tooltip.Constructor=t,e.fn.tooltip.defaults={animation:!0,placement:"top",selector:!1,template:'<div class="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',trigger:"hover focus",title:"",delay:0,html:!1,container:!1},e.fn.tooltip.noConflict=function(){return e.fn.tooltip=n,this}}(window.jQuery),!function(e){"use strict";var t=function(e,t){this.init("popover",e,t)};t.prototype=e.extend({},e.fn.tooltip.Constructor.prototype,{constructor:t,setContent:function(){var e=this.tip(),t=this.getTitle(),n=this.getContent();e.find(".popover-title")[this.options.html?"html":"text"](t),e.find(".popover-content")[this.options.html?"html":"text"](n),e.removeClass("fade top bottom left right in")},hasContent:function(){return this.getTitle()||this.getContent()},getContent:function(){var e,t=this.$element,n=this.options;return e=(typeof n.content=="function"?n.content.call(t[0]):n.content)||t.attr("data-content"),e},tip:function(){return this.$tip||(this.$tip=e(this.options.template)),this.$tip},destroy:function(){this.hide().$element.off("."+this.type).removeData(this.type)}});var n=e.fn.popover;e.fn.popover=function(n){return this.each(function(){var r=e(this),i=r.data("popover"),s=typeof n=="object"&&n;i||r.data("popover",i=new t(this,s)),typeof n=="string"&&i[n]()})},e.fn.popover.Constructor=t,e.fn.popover.defaults=e.extend({},e.fn.tooltip.defaults,{placement:"right",trigger:"click",content:"",template:'<div class="popover"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'}),e.fn.popover.noConflict=function(){return e.fn.popover=n,this}}(window.jQuery),!function(e){"use strict";function t(t,n){var r=e.proxy(this.process,this),i=e(t).is("body")?e(window):e(t),s;this.options=e.extend({},e.fn.scrollspy.defaults,n),this.$scrollElement=i.on("scroll.scroll-spy.data-api",r),this.selector=(this.options.target||(s=e(t).attr("href"))&&s.replace(/.*(?=#[^\s]+$)/,"")||"")+" .nav li > a",this.$body=e("body"),this.refresh(),this.process()}t.prototype={constructor:t,refresh:function(){var t=this,n;this.offsets=e([]),this.targets=e([]),n=this.$body.find(this.selector).map(function(){var n=e(this),r=n.data("target")||n.attr("href"),i=/^#\w/.test(r)&&e(r);return i&&i.length&&[[i.position().top+(!e.isWindow(t.$scrollElement.get(0))&&t.$scrollElement.scrollTop()),r]]||null}).sort(function(e,t){return e[0]-t[0]}).each(function(){t.offsets.push(this[0]),t.targets.push(this[1])})},process:function(){var e=this.$scrollElement.scrollTop()+this.options.offset,t=this.$scrollElement[0].scrollHeight||this.$body[0].scrollHeight,n=t-this.$scrollElement.height(),r=this.offsets,i=this.targets,s=this.activeTarget,o;if(e>=n)return s!=(o=i.last()[0])&&this.activate(o);for(o=r.length;o--;)s!=i[o]&&e>=r[o]&&(!r[o+1]||e<=r[o+1])&&this.activate(i[o])},activate:function(t){var n,r;this.activeTarget=t,e(this.selector).parent(".active").removeClass("active"),r=this.selector+'[data-target="'+t+'"],'+this.selector+'[href="'+t+'"]',n=e(r).parent("li").addClass("active"),n.parent(".dropdown-menu").length&&(n=n.closest("li.dropdown").addClass("active")),n.trigger("activate")}};var n=e.fn.scrollspy;e.fn.scrollspy=function(n){return this.each(function(){var r=e(this),i=r.data("scrollspy"),s=typeof n=="object"&&n;i||r.data("scrollspy",i=new t(this,s)),typeof n=="string"&&i[n]()})},e.fn.scrollspy.Constructor=t,e.fn.scrollspy.defaults={offset:10},e.fn.scrollspy.noConflict=function(){return e.fn.scrollspy=n,this},e(window).on("load",function(){e('[data-spy="scroll"]').each(function(){var t=e(this);t.scrollspy(t.data())})})}(window.jQuery),!function(e){"use strict";var t=function(t){this.element=e(t)};t.prototype={constructor:t,show:function(){var t=this.element,n=t.closest("ul:not(.dropdown-menu)"),r=t.attr("data-target"),i,s,o;r||(r=t.attr("href"),r=r&&r.replace(/.*(?=#[^\s]*$)/,""));if(t.parent("li").hasClass("active"))return;i=n.find(".active:last a")[0],o=e.Event("show",{relatedTarget:i}),t.trigger(o);if(o.isDefaultPrevented())return;s=e(r),this.activate(t.parent("li"),n),this.activate(s,s.parent(),function(){t.trigger({type:"shown",relatedTarget:i})})},activate:function(t,n,r){function o(){i.removeClass("active").find("> .dropdown-menu > .active").removeClass("active"),t.addClass("active"),s?(t[0].offsetWidth,t.addClass("in")):t.removeClass("fade"),t.parent(".dropdown-menu")&&t.closest("li.dropdown").addClass("active"),r&&r()}var i=n.find("> .active"),s=r&&e.support.transition&&i.hasClass("fade");s?i.one(e.support.transition.end,o):o(),i.removeClass("in")}};var n=e.fn.tab;e.fn.tab=function(n){return this.each(function(){var r=e(this),i=r.data("tab");i||r.data("tab",i=new t(this)),typeof n=="string"&&i[n]()})},e.fn.tab.Constructor=t,e.fn.tab.noConflict=function(){return e.fn.tab=n,this},e(document).on("click.tab.data-api",'[data-toggle="tab"], [data-toggle="pill"]',function(t){t.preventDefault(),e(this).tab("show")})}(window.jQuery),!function(e){"use strict";var t=function(t,n){this.$element=e(t),this.options=e.extend({},e.fn.typeahead.defaults,n),this.matcher=this.options.matcher||this.matcher,this.sorter=this.options.sorter||this.sorter,this.highlighter=this.options.highlighter||this.highlighter,this.updater=this.options.updater||this.updater,this.source=this.options.source,this.$menu=e(this.options.menu),this.shown=!1,this.listen()};t.prototype={constructor:t,select:function(){var e=this.$menu.find(".active").attr("data-value");return this.$element.val(this.updater(e)).change(),this.hide()},updater:function(e){return e},show:function(){var t=e.extend({},this.$element.position(),{height:this.$element[0].offsetHeight});return this.$menu.insertAfter(this.$element).css({top:t.top+t.height,left:t.left}).show(),this.shown=!0,this},hide:function(){return this.$menu.hide(),this.shown=!1,this},lookup:function(t){var n;return this.query=this.$element.val(),!this.query||this.query.length<this.options.minLength?this.shown?this.hide():this:(n=e.isFunction(this.source)?this.source(this.query,e.proxy(this.process,this)):this.source,n?this.process(n):this)},process:function(t){var n=this;return t=e.grep(t,function(e){return n.matcher(e)}),t=this.sorter(t),t.length?this.render(t.slice(0,this.options.items)).show():this.shown?this.hide():this},matcher:function(e){return~e.toLowerCase().indexOf(this.query.toLowerCase())},sorter:function(e){var t=[],n=[],r=[],i;while(i=e.shift())i.toLowerCase().indexOf(this.query.toLowerCase())?~i.indexOf(this.query)?n.push(i):r.push(i):t.push(i);return t.concat(n,r)},highlighter:function(e){var t=this.query.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g,"\\$&");return e.replace(new RegExp("("+t+")","ig"),function(e,t){return"<strong>"+t+"</strong>"})},render:function(t){var n=this;return t=e(t).map(function(t,r){return t=e(n.options.item).attr("data-value",r),t.find("a").html(n.highlighter(r)),t[0]}),t.first().addClass("active"),this.$menu.html(t),this},next:function(t){var n=this.$menu.find(".active").removeClass("active"),r=n.next();r.length||(r=e(this.$menu.find("li")[0])),r.addClass("active")},prev:function(e){var t=this.$menu.find(".active").removeClass("active"),n=t.prev();n.length||(n=this.$menu.find("li").last()),n.addClass("active")},listen:function(){this.$element.on("focus",e.proxy(this.focus,this)).on("blur",e.proxy(this.blur,this)).on("keypress",e.proxy(this.keypress,this)).on("keyup",e.proxy(this.keyup,this)),this.eventSupported("keydown")&&this.$element.on("keydown",e.proxy(this.keydown,this)),this.$menu.on("click",e.proxy(this.click,this)).on("mouseenter","li",e.proxy(this.mouseenter,this)).on("mouseleave","li",e.proxy(this.mouseleave,this))},eventSupported:function(e){var t=e in this.$element;return t||(this.$element.setAttribute(e,"return;"),t=typeof this.$element[e]=="function"),t},move:function(e){if(!this.shown)return;switch(e.keyCode){case 9:case 13:case 27:e.preventDefault();break;case 38:e.preventDefault(),this.prev();break;case 40:e.preventDefault(),this.next()}e.stopPropagation()},keydown:function(t){this.suppressKeyPressRepeat=~e.inArray(t.keyCode,[40,38,9,13,27]),this.move(t)},keypress:function(e){if(this.suppressKeyPressRepeat)return;this.move(e)},keyup:function(e){switch(e.keyCode){case 40:case 38:case 16:case 17:case 18:break;case 9:case 13:if(!this.shown)return;this.select();break;case 27:if(!this.shown)return;this.hide();break;default:this.lookup()}e.stopPropagation(),e.preventDefault()},focus:function(e){this.focused=!0},blur:function(e){this.focused=!1,!this.mousedover&&this.shown&&this.hide()},click:function(e){e.stopPropagation(),e.preventDefault(),this.select(),this.$element.focus()},mouseenter:function(t){this.mousedover=!0,this.$menu.find(".active").removeClass("active"),e(t.currentTarget).addClass("active")},mouseleave:function(e){this.mousedover=!1,!this.focused&&this.shown&&this.hide()}};var n=e.fn.typeahead;e.fn.typeahead=function(n){return this.each(function(){var r=e(this),i=r.data("typeahead"),s=typeof n=="object"&&n;i||r.data("typeahead",i=new t(this,s)),typeof n=="string"&&i[n]()})},e.fn.typeahead.defaults={source:[],items:8,menu:'<ul class="typeahead dropdown-menu"></ul>',item:'<li><a href="#"></a></li>',minLength:1},e.fn.typeahead.Constructor=t,e.fn.typeahead.noConflict=function(){return e.fn.typeahead=n,this},e(document).on("focus.typeahead.data-api",'[data-provide="typeahead"]',function(t){var n=e(this);if(n.data("typeahead"))return;n.typeahead(n.data())})}(window.jQuery),!function(e){"use strict";var t=function(t,n){this.options=e.extend({},e.fn.affix.defaults,n),this.$window=e(window).on("scroll.affix.data-api",e.proxy(this.checkPosition,this)).on("click.affix.data-api",e.proxy(function(){setTimeout(e.proxy(this.checkPosition,this),1)},this)),this.$element=e(t),this.checkPosition()};t.prototype.checkPosition=function(){if(!this.$element.is(":visible"))return;var t=e(document).height(),n=this.$window.scrollTop(),r=this.$element.offset(),i=this.options.offset,s=i.bottom,o=i.top,u="affix affix-top affix-bottom",a;typeof i!="object"&&(s=o=i),typeof o=="function"&&(o=i.top()),typeof s=="function"&&(s=i.bottom()),a=this.unpin!=null&&n+this.unpin<=r.top?!1:s!=null&&r.top+this.$element.height()>=t-s?"bottom":o!=null&&n<=o?"top":!1;if(this.affixed===a)return;this.affixed=a,this.unpin=a=="bottom"?r.top-n:null,this.$element.removeClass(u).addClass("affix"+(a?"-"+a:""))};var n=e.fn.affix;e.fn.affix=function(n){return this.each(function(){var r=e(this),i=r.data("affix"),s=typeof n=="object"&&n;i||r.data("affix",i=new t(this,s)),typeof n=="string"&&i[n]()})},e.fn.affix.Constructor=t,e.fn.affix.defaults={offset:0},e.fn.affix.noConflict=function(){return e.fn.affix=n,this},e(window).on("load",function(){e('[data-spy="affix"]').each(function(){var t=e(this),n=t.data();n.offset=n.offset||{},n.offsetBottom&&(n.offset.bottom=n.offsetBottom),n.offsetTop&&(n.offset.top=n.offsetTop),t.affix(n)})})}(window.jQuery);
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

/*!
* Bootstrap.js by @fat & @mdo
* Copyright 2012 Twitter, Inc.
* http://www.apache.org/licenses/LICENSE-2.0.txt
*/
!function($){"use strict";$(function(){$.support.transition=function(){var transitionEnd=function(){var name,el=document.createElement("bootstrap"),transEndEventNames={WebkitTransition:"webkitTransitionEnd",MozTransition:"transitionend",OTransition:"oTransitionEnd otransitionend",transition:"transitionend"};for(name in transEndEventNames)if(void 0!==el.style[name])return transEndEventNames[name]}();return transitionEnd&&{end:transitionEnd}}()})}(window.jQuery),!function($){"use strict";var dismiss='[data-dismiss="alert"]',Alert=function(el){$(el).on("click",dismiss,this.close)};Alert.prototype.close=function(e){function removeElement(){$parent.trigger("closed").remove()}var $parent,$this=$(this),selector=$this.attr("data-target");selector||(selector=$this.attr("href"),selector=selector&&selector.replace(/.*(?=#[^\s]*$)/,"")),$parent=$(selector),e&&e.preventDefault(),$parent.length||($parent=$this.hasClass("alert")?$this:$this.parent()),$parent.trigger(e=$.Event("close")),e.isDefaultPrevented()||($parent.removeClass("in"),$.support.transition&&$parent.hasClass("fade")?$parent.on($.support.transition.end,removeElement):removeElement())};var old=$.fn.alert;$.fn.alert=function(option){return this.each(function(){var $this=$(this),data=$this.data("alert");data||$this.data("alert",data=new Alert(this)),"string"==typeof option&&data[option].call($this)})},$.fn.alert.Constructor=Alert,$.fn.alert.noConflict=function(){return $.fn.alert=old,this},$(document).on("click.alert.data-api",dismiss,Alert.prototype.close)}(window.jQuery),!function($){"use strict";var Button=function(element,options){this.$element=$(element),this.options=$.extend({},$.fn.button.defaults,options)};Button.prototype.setState=function(state){var d="disabled",$el=this.$element,data=$el.data(),val=$el.is("input")?"val":"html";state+="Text",data.resetText||$el.data("resetText",$el[val]()),$el[val](data[state]||this.options[state]),setTimeout(function(){"loadingText"==state?$el.addClass(d).attr(d,d):$el.removeClass(d).removeAttr(d)},0)},Button.prototype.toggle=function(){var $parent=this.$element.closest('[data-toggle="buttons-radio"]');$parent&&$parent.find(".active").removeClass("active"),this.$element.toggleClass("active")};var old=$.fn.button;$.fn.button=function(option){return this.each(function(){var $this=$(this),data=$this.data("button"),options="object"==typeof option&&option;data||$this.data("button",data=new Button(this,options)),"toggle"==option?data.toggle():option&&data.setState(option)})},$.fn.button.defaults={loadingText:"loading..."},$.fn.button.Constructor=Button,$.fn.button.noConflict=function(){return $.fn.button=old,this},$(document).on("click.button.data-api","[data-toggle^=button]",function(e){var $btn=$(e.target);$btn.hasClass("btn")||($btn=$btn.closest(".btn")),$btn.button("toggle")})}(window.jQuery),!function($){"use strict";var Carousel=function(element,options){this.$element=$(element),this.options=options,"hover"==this.options.pause&&this.$element.on("mouseenter",$.proxy(this.pause,this)).on("mouseleave",$.proxy(this.cycle,this))};Carousel.prototype={cycle:function(e){return e||(this.paused=!1),this.options.interval&&!this.paused&&(this.interval=setInterval($.proxy(this.next,this),this.options.interval)),this},to:function(pos){var $active=this.$element.find(".item.active"),children=$active.parent().children(),activePos=children.index($active),that=this;if(!(pos>children.length-1||0>pos))return this.sliding?this.$element.one("slid",function(){that.to(pos)}):activePos==pos?this.pause().cycle():this.slide(pos>activePos?"next":"prev",$(children[pos]))},pause:function(e){return e||(this.paused=!0),this.$element.find(".next, .prev").length&&$.support.transition.end&&(this.$element.trigger($.support.transition.end),this.cycle()),clearInterval(this.interval),this.interval=null,this},next:function(){return this.sliding?void 0:this.slide("next")},prev:function(){return this.sliding?void 0:this.slide("prev")},slide:function(type,next){var e,$active=this.$element.find(".item.active"),$next=next||$active[type](),isCycling=this.interval,direction="next"==type?"left":"right",fallback="next"==type?"first":"last",that=this;if(this.sliding=!0,isCycling&&this.pause(),$next=$next.length?$next:this.$element.find(".item")[fallback](),e=$.Event("slide",{relatedTarget:$next[0]}),!$next.hasClass("active")){if($.support.transition&&this.$element.hasClass("slide")){if(this.$element.trigger(e),e.isDefaultPrevented())return;$next.addClass(type),$next[0].offsetWidth,$active.addClass(direction),$next.addClass(direction),this.$element.one($.support.transition.end,function(){$next.removeClass([type,direction].join(" ")).addClass("active"),$active.removeClass(["active",direction].join(" ")),that.sliding=!1,setTimeout(function(){that.$element.trigger("slid")},0)})}else{if(this.$element.trigger(e),e.isDefaultPrevented())return;$active.removeClass("active"),$next.addClass("active"),this.sliding=!1,this.$element.trigger("slid")}return isCycling&&this.cycle(),this}}};var old=$.fn.carousel;$.fn.carousel=function(option){return this.each(function(){var $this=$(this),data=$this.data("carousel"),options=$.extend({},$.fn.carousel.defaults,"object"==typeof option&&option),action="string"==typeof option?option:options.slide;data||$this.data("carousel",data=new Carousel(this,options)),"number"==typeof option?data.to(option):action?data[action]():options.interval&&data.cycle()})},$.fn.carousel.defaults={interval:5e3,pause:"hover"},$.fn.carousel.Constructor=Carousel,$.fn.carousel.noConflict=function(){return $.fn.carousel=old,this},$(document).on("click.carousel.data-api","[data-slide]",function(e){var href,$this=$(this),$target=$($this.attr("data-target")||(href=$this.attr("href"))&&href.replace(/.*(?=#[^\s]+$)/,"")),options=$.extend({},$target.data(),$this.data());$target.carousel(options),e.preventDefault()})}(window.jQuery),!function($){"use strict";var Collapse=function(element,options){this.$element=$(element),this.options=$.extend({},$.fn.collapse.defaults,options),this.options.parent&&(this.$parent=$(this.options.parent)),this.options.toggle&&this.toggle()};Collapse.prototype={constructor:Collapse,dimension:function(){var hasWidth=this.$element.hasClass("width");return hasWidth?"width":"height"},show:function(){var dimension,scroll,actives,hasData;if(!this.transitioning){if(dimension=this.dimension(),scroll=$.camelCase(["scroll",dimension].join("-")),actives=this.$parent&&this.$parent.find("> .accordion-group > .in"),actives&&actives.length){if(hasData=actives.data("collapse"),hasData&&hasData.transitioning)return;actives.collapse("hide"),hasData||actives.data("collapse",null)}this.$element[dimension](0),this.transition("addClass",$.Event("show"),"shown"),$.support.transition&&this.$element[dimension](this.$element[0][scroll])}},hide:function(){var dimension;this.transitioning||(dimension=this.dimension(),this.reset(this.$element[dimension]()),this.transition("removeClass",$.Event("hide"),"hidden"),this.$element[dimension](0))},reset:function(size){var dimension=this.dimension();return this.$element.removeClass("collapse")[dimension](size||"auto")[0].offsetWidth,this.$element[null!==size?"addClass":"removeClass"]("collapse"),this},transition:function(method,startEvent,completeEvent){var that=this,complete=function(){"show"==startEvent.type&&that.reset(),that.transitioning=0,that.$element.trigger(completeEvent)};this.$element.trigger(startEvent),startEvent.isDefaultPrevented()||(this.transitioning=1,this.$element[method]("in"),$.support.transition&&this.$element.hasClass("collapse")?this.$element.one($.support.transition.end,complete):complete())},toggle:function(){this[this.$element.hasClass("in")?"hide":"show"]()}};var old=$.fn.collapse;$.fn.collapse=function(option){return this.each(function(){var $this=$(this),data=$this.data("collapse"),options="object"==typeof option&&option;data||$this.data("collapse",data=new Collapse(this,options)),"string"==typeof option&&data[option]()})},$.fn.collapse.defaults={toggle:!0},$.fn.collapse.Constructor=Collapse,$.fn.collapse.noConflict=function(){return $.fn.collapse=old,this},$(document).on("click.collapse.data-api","[data-toggle=collapse]",function(e){var href,$this=$(this),target=$this.attr("data-target")||e.preventDefault()||(href=$this.attr("href"))&&href.replace(/.*(?=#[^\s]+$)/,""),option=$(target).data("collapse")?"toggle":$this.data();$this[$(target).hasClass("in")?"addClass":"removeClass"]("collapsed"),$(target).collapse(option)})}(window.jQuery),!function($){"use strict";function clearMenus(){$(toggle).each(function(){getParent($(this)).removeClass("open")})}function getParent($this){var $parent,selector=$this.attr("data-target");return selector||(selector=$this.attr("href"),selector=selector&&/#/.test(selector)&&selector.replace(/.*(?=#[^\s]*$)/,"")),$parent=$(selector),$parent.length||($parent=$this.parent()),$parent}var toggle="[data-toggle=dropdown]",Dropdown=function(element){var $el=$(element).on("click.dropdown.data-api",this.toggle);$("html").on("click.dropdown.data-api",function(){$el.parent().removeClass("open")})};Dropdown.prototype={constructor:Dropdown,toggle:function(){var $parent,isActive,$this=$(this);if(!$this.is(".disabled, :disabled"))return $parent=getParent($this),isActive=$parent.hasClass("open"),clearMenus(),isActive||$parent.toggleClass("open"),$this.focus(),!1},keydown:function(e){var $this,$items,$parent,isActive,index;if(/(38|40|27)/.test(e.keyCode)&&($this=$(this),e.preventDefault(),e.stopPropagation(),!$this.is(".disabled, :disabled"))){if($parent=getParent($this),isActive=$parent.hasClass("open"),!isActive||isActive&&27==e.keyCode)return $this.click();$items=$("[role=menu] li:not(.divider):visible a",$parent),$items.length&&(index=$items.index($items.filter(":focus")),38==e.keyCode&&index>0&&index--,40==e.keyCode&&$items.length-1>index&&index++,~index||(index=0),$items.eq(index).focus())}}};var old=$.fn.dropdown;$.fn.dropdown=function(option){return this.each(function(){var $this=$(this),data=$this.data("dropdown");data||$this.data("dropdown",data=new Dropdown(this)),"string"==typeof option&&data[option].call($this)})},$.fn.dropdown.Constructor=Dropdown,$.fn.dropdown.noConflict=function(){return $.fn.dropdown=old,this},$(document).on("click.dropdown.data-api touchstart.dropdown.data-api",clearMenus).on("click.dropdown touchstart.dropdown.data-api",".dropdown form",function(e){e.stopPropagation()}).on("touchstart.dropdown.data-api",".dropdown-menu",function(e){e.stopPropagation()}).on("click.dropdown.data-api touchstart.dropdown.data-api",toggle,Dropdown.prototype.toggle).on("keydown.dropdown.data-api touchstart.dropdown.data-api",toggle+", [role=menu]",Dropdown.prototype.keydown)}(window.jQuery),!function($){"use strict";var Modal=function(element,options){this.options=options,this.$element=$(element).delegate('[data-dismiss="modal"]',"click.dismiss.modal",$.proxy(this.hide,this)),this.options.remote&&this.$element.find(".modal-body").load(this.options.remote)};Modal.prototype={constructor:Modal,toggle:function(){return this[this.isShown?"hide":"show"]()},show:function(){var that=this,e=$.Event("show");this.$element.trigger(e),this.isShown||e.isDefaultPrevented()||(this.isShown=!0,this.escape(),this.backdrop(function(){var transition=$.support.transition&&that.$element.hasClass("fade");that.$element.parent().length||that.$element.appendTo(document.body),that.$element.show(),transition&&that.$element[0].offsetWidth,that.$element.addClass("in").attr("aria-hidden",!1),that.enforceFocus(),transition?that.$element.one($.support.transition.end,function(){that.$element.focus().trigger("shown")}):that.$element.focus().trigger("shown")}))},hide:function(e){e&&e.preventDefault(),e=$.Event("hide"),this.$element.trigger(e),this.isShown&&!e.isDefaultPrevented()&&(this.isShown=!1,this.escape(),$(document).off("focusin.modal"),this.$element.removeClass("in").attr("aria-hidden",!0),$.support.transition&&this.$element.hasClass("fade")?this.hideWithTransition():this.hideModal())},enforceFocus:function(){var that=this;$(document).on("focusin.modal",function(e){that.$element[0]===e.target||that.$element.has(e.target).length||that.$element.focus()})},escape:function(){var that=this;this.isShown&&this.options.keyboard?this.$element.on("keyup.dismiss.modal",function(e){27==e.which&&that.hide()}):this.isShown||this.$element.off("keyup.dismiss.modal")},hideWithTransition:function(){var that=this,timeout=setTimeout(function(){that.$element.off($.support.transition.end),that.hideModal()},500);this.$element.one($.support.transition.end,function(){clearTimeout(timeout),that.hideModal()})},hideModal:function(){this.$element.hide().trigger("hidden"),this.backdrop()},removeBackdrop:function(){this.$backdrop.remove(),this.$backdrop=null},backdrop:function(callback){var animate=this.$element.hasClass("fade")?"fade":"";if(this.isShown&&this.options.backdrop){var doAnimate=$.support.transition&&animate;this.$backdrop=$('<div class="modal-backdrop '+animate+'" />').appendTo(document.body),this.$backdrop.click("static"==this.options.backdrop?$.proxy(this.$element[0].focus,this.$element[0]):$.proxy(this.hide,this)),doAnimate&&this.$backdrop[0].offsetWidth,this.$backdrop.addClass("in"),doAnimate?this.$backdrop.one($.support.transition.end,callback):callback()}else!this.isShown&&this.$backdrop?(this.$backdrop.removeClass("in"),$.support.transition&&this.$element.hasClass("fade")?this.$backdrop.one($.support.transition.end,$.proxy(this.removeBackdrop,this)):this.removeBackdrop()):callback&&callback()}};var old=$.fn.modal;$.fn.modal=function(option){return this.each(function(){var $this=$(this),data=$this.data("modal"),options=$.extend({},$.fn.modal.defaults,$this.data(),"object"==typeof option&&option);data||$this.data("modal",data=new Modal(this,options)),"string"==typeof option?data[option]():options.show&&data.show()})},$.fn.modal.defaults={backdrop:!0,keyboard:!0,show:!0},$.fn.modal.Constructor=Modal,$.fn.modal.noConflict=function(){return $.fn.modal=old,this},$(document).on("click.modal.data-api",'[data-toggle="modal"]',function(e){var $this=$(this),href=$this.attr("href"),$target=$($this.attr("data-target")||href&&href.replace(/.*(?=#[^\s]+$)/,"")),option=$target.data("modal")?"toggle":$.extend({remote:!/#/.test(href)&&href},$target.data(),$this.data());e.preventDefault(),$target.modal(option).one("hide",function(){$this.focus()})})}(window.jQuery),!function($){"use strict";var Tooltip=function(element,options){this.init("tooltip",element,options)};Tooltip.prototype={constructor:Tooltip,init:function(type,element,options){var eventIn,eventOut;this.type=type,this.$element=$(element),this.options=this.getOptions(options),this.enabled=!0,"click"==this.options.trigger?this.$element.on("click."+this.type,this.options.selector,$.proxy(this.toggle,this)):"manual"!=this.options.trigger&&(eventIn="hover"==this.options.trigger?"mouseenter":"focus",eventOut="hover"==this.options.trigger?"mouseleave":"blur",this.$element.on(eventIn+"."+this.type,this.options.selector,$.proxy(this.enter,this)),this.$element.on(eventOut+"."+this.type,this.options.selector,$.proxy(this.leave,this))),this.options.selector?this._options=$.extend({},this.options,{trigger:"manual",selector:""}):this.fixTitle()},getOptions:function(options){return options=$.extend({},$.fn[this.type].defaults,options,this.$element.data()),options.delay&&"number"==typeof options.delay&&(options.delay={show:options.delay,hide:options.delay}),options},enter:function(e){var self=$(e.currentTarget)[this.type](this._options).data(this.type);return self.options.delay&&self.options.delay.show?(clearTimeout(this.timeout),self.hoverState="in",this.timeout=setTimeout(function(){"in"==self.hoverState&&self.show()},self.options.delay.show),void 0):self.show()},leave:function(e){var self=$(e.currentTarget)[this.type](this._options).data(this.type);return this.timeout&&clearTimeout(this.timeout),self.options.delay&&self.options.delay.hide?(self.hoverState="out",this.timeout=setTimeout(function(){"out"==self.hoverState&&self.hide()},self.options.delay.hide),void 0):self.hide()},show:function(){var $tip,inside,pos,actualWidth,actualHeight,placement,tp;if(this.hasContent()&&this.enabled){switch($tip=this.tip(),this.setContent(),this.options.animation&&$tip.addClass("fade"),placement="function"==typeof this.options.placement?this.options.placement.call(this,$tip[0],this.$element[0]):this.options.placement,inside=/in/.test(placement),$tip.detach().css({top:0,left:0,display:"block"}).insertAfter(this.$element),pos=this.getPosition(inside),actualWidth=$tip[0].offsetWidth,actualHeight=$tip[0].offsetHeight,inside?placement.split(" ")[1]:placement){case"bottom":tp={top:pos.top+pos.height,left:pos.left+pos.width/2-actualWidth/2};break;case"top":tp={top:pos.top-actualHeight,left:pos.left+pos.width/2-actualWidth/2};break;case"left":tp={top:pos.top+pos.height/2-actualHeight/2,left:pos.left-actualWidth};break;case"right":tp={top:pos.top+pos.height/2-actualHeight/2,left:pos.left+pos.width}}$tip.offset(tp).addClass(placement).addClass("in")}},setContent:function(){var $tip=this.tip(),title=this.getTitle();$tip.find(".tooltip-inner")[this.options.html?"html":"text"](title),$tip.removeClass("fade in top bottom left right")},hide:function(){function removeWithAnimation(){var timeout=setTimeout(function(){$tip.off($.support.transition.end).detach()},500);$tip.one($.support.transition.end,function(){clearTimeout(timeout),$tip.detach()})}var $tip=this.tip();return $tip.removeClass("in"),$.support.transition&&this.$tip.hasClass("fade")?removeWithAnimation():$tip.detach(),this},fixTitle:function(){var $e=this.$element;($e.attr("title")||"string"!=typeof $e.attr("data-original-title"))&&$e.attr("data-original-title",$e.attr("title")||"").removeAttr("title")},hasContent:function(){return this.getTitle()},getPosition:function(inside){return $.extend({},inside?{top:0,left:0}:this.$element.offset(),{width:this.$element[0].offsetWidth,height:this.$element[0].offsetHeight})},getTitle:function(){var title,$e=this.$element,o=this.options;return title=$e.attr("data-original-title")||("function"==typeof o.title?o.title.call($e[0]):o.title)},tip:function(){return this.$tip=this.$tip||$(this.options.template)},validate:function(){this.$element[0].parentNode||(this.hide(),this.$element=null,this.options=null)},enable:function(){this.enabled=!0},disable:function(){this.enabled=!1},toggleEnabled:function(){this.enabled=!this.enabled},toggle:function(e){var self=$(e.currentTarget)[this.type](this._options).data(this.type);self[self.tip().hasClass("in")?"hide":"show"]()},destroy:function(){this.hide().$element.off("."+this.type).removeData(this.type)}};var old=$.fn.tooltip;$.fn.tooltip=function(option){return this.each(function(){var $this=$(this),data=$this.data("tooltip"),options="object"==typeof option&&option;data||$this.data("tooltip",data=new Tooltip(this,options)),"string"==typeof option&&data[option]()})},$.fn.tooltip.Constructor=Tooltip,$.fn.tooltip.defaults={animation:!0,placement:"top",selector:!1,template:'<div class="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',trigger:"hover",title:"",delay:0,html:!1},$.fn.tooltip.noConflict=function(){return $.fn.tooltip=old,this}}(window.jQuery),!function($){"use strict";var Popover=function(element,options){this.init("popover",element,options)};Popover.prototype=$.extend({},$.fn.tooltip.Constructor.prototype,{constructor:Popover,setContent:function(){var $tip=this.tip(),title=this.getTitle(),content=this.getContent();$tip.find(".popover-title")[this.options.html?"html":"text"](title),$tip.find(".popover-content")[this.options.html?"html":"text"](content),$tip.removeClass("fade top bottom left right in")},hasContent:function(){return this.getTitle()||this.getContent()},getContent:function(){var content,$e=this.$element,o=this.options;return content=$e.attr("data-content")||("function"==typeof o.content?o.content.call($e[0]):o.content)},tip:function(){return this.$tip||(this.$tip=$(this.options.template)),this.$tip},destroy:function(){this.hide().$element.off("."+this.type).removeData(this.type)}});var old=$.fn.popover;$.fn.popover=function(option){return this.each(function(){var $this=$(this),data=$this.data("popover"),options="object"==typeof option&&option;data||$this.data("popover",data=new Popover(this,options)),"string"==typeof option&&data[option]()})},$.fn.popover.Constructor=Popover,$.fn.popover.defaults=$.extend({},$.fn.tooltip.defaults,{placement:"right",trigger:"click",content:"",template:'<div class="popover"><div class="arrow"></div><div class="popover-inner"><h3 class="popover-title"></h3><div class="popover-content"></div></div></div>'}),$.fn.popover.noConflict=function(){return $.fn.popover=old,this}}(window.jQuery),!function($){"use strict";function ScrollSpy(element,options){var href,process=$.proxy(this.process,this),$element=$(element).is("body")?$(window):$(element);this.options=$.extend({},$.fn.scrollspy.defaults,options),this.$scrollElement=$element.on("scroll.scroll-spy.data-api",process),this.selector=(this.options.target||(href=$(element).attr("href"))&&href.replace(/.*(?=#[^\s]+$)/,"")||"")+" .nav li > a",this.$body=$("body"),this.refresh(),this.process()}ScrollSpy.prototype={constructor:ScrollSpy,refresh:function(){var $targets,self=this;this.offsets=$([]),this.targets=$([]),$targets=this.$body.find(this.selector).map(function(){var $el=$(this),href=$el.data("target")||$el.attr("href"),$href=/^#\w/.test(href)&&$(href);return $href&&$href.length&&[[$href.position().top+self.$scrollElement.scrollTop(),href]]||null}).sort(function(a,b){return a[0]-b[0]}).each(function(){self.offsets.push(this[0]),self.targets.push(this[1])})},process:function(){var i,scrollTop=this.$scrollElement.scrollTop()+this.options.offset,scrollHeight=this.$scrollElement[0].scrollHeight||this.$body[0].scrollHeight,maxScroll=scrollHeight-this.$scrollElement.height(),offsets=this.offsets,targets=this.targets,activeTarget=this.activeTarget;if(scrollTop>=maxScroll)return activeTarget!=(i=targets.last()[0])&&this.activate(i);for(i=offsets.length;i--;)activeTarget!=targets[i]&&scrollTop>=offsets[i]&&(!offsets[i+1]||offsets[i+1]>=scrollTop)&&this.activate(targets[i])},activate:function(target){var active,selector;this.activeTarget=target,$(this.selector).parent(".active").removeClass("active"),selector=this.selector+'[data-target="'+target+'"],'+this.selector+'[href="'+target+'"]',active=$(selector).parent("li").addClass("active"),active.parent(".dropdown-menu").length&&(active=active.closest("li.dropdown").addClass("active")),active.trigger("activate")}};var old=$.fn.scrollspy;$.fn.scrollspy=function(option){return this.each(function(){var $this=$(this),data=$this.data("scrollspy"),options="object"==typeof option&&option;data||$this.data("scrollspy",data=new ScrollSpy(this,options)),"string"==typeof option&&data[option]()})},$.fn.scrollspy.Constructor=ScrollSpy,$.fn.scrollspy.defaults={offset:10},$.fn.scrollspy.noConflict=function(){return $.fn.scrollspy=old,this},$(window).on("load",function(){$('[data-spy="scroll"]').each(function(){var $spy=$(this);$spy.scrollspy($spy.data())})})}(window.jQuery),!function($){"use strict";var Tab=function(element){this.element=$(element)};Tab.prototype={constructor:Tab,show:function(){var previous,$target,e,$this=this.element,$ul=$this.closest("ul:not(.dropdown-menu)"),selector=$this.attr("data-target");selector||(selector=$this.attr("href"),selector=selector&&selector.replace(/.*(?=#[^\s]*$)/,"")),$this.parent("li").hasClass("active")||(previous=$ul.find(".active:last a")[0],e=$.Event("show",{relatedTarget:previous}),$this.trigger(e),e.isDefaultPrevented()||($target=$(selector),this.activate($this.parent("li"),$ul),this.activate($target,$target.parent(),function(){$this.trigger({type:"shown",relatedTarget:previous})})))},activate:function(element,container,callback){function next(){$active.removeClass("active").find("> .dropdown-menu > .active").removeClass("active"),element.addClass("active"),transition?(element[0].offsetWidth,element.addClass("in")):element.removeClass("fade"),element.parent(".dropdown-menu")&&element.closest("li.dropdown").addClass("active"),callback&&callback()}var $active=container.find("> .active"),transition=callback&&$.support.transition&&$active.hasClass("fade");transition?$active.one($.support.transition.end,next):next(),$active.removeClass("in")}};var old=$.fn.tab;$.fn.tab=function(option){return this.each(function(){var $this=$(this),data=$this.data("tab");data||$this.data("tab",data=new Tab(this)),"string"==typeof option&&data[option]()})},$.fn.tab.Constructor=Tab,$.fn.tab.noConflict=function(){return $.fn.tab=old,this},$(document).on("click.tab.data-api",'[data-toggle="tab"], [data-toggle="pill"]',function(e){e.preventDefault(),$(this).tab("show")})}(window.jQuery),!function($){"use strict";var Typeahead=function(element,options){this.$element=$(element),this.options=$.extend({},$.fn.typeahead.defaults,options),this.matcher=this.options.matcher||this.matcher,this.sorter=this.options.sorter||this.sorter,this.highlighter=this.options.highlighter||this.highlighter,this.updater=this.options.updater||this.updater,this.source=this.options.source,this.$menu=$(this.options.menu),this.shown=!1,this.listen()};Typeahead.prototype={constructor:Typeahead,select:function(){var val=this.$menu.find(".active").attr("data-value");return this.$element.val(this.updater(val)).change(),this.hide()},updater:function(item){return item},show:function(){var pos=$.extend({},this.$element.position(),{height:this.$element[0].offsetHeight});return this.$menu.insertAfter(this.$element).css({top:pos.top+pos.height,left:pos.left}).show(),this.shown=!0,this},hide:function(){return this.$menu.hide(),this.shown=!1,this},lookup:function(){var items;return this.query=this.$element.val(),!this.query||this.query.length<this.options.minLength?this.shown?this.hide():this:(items=$.isFunction(this.source)?this.source(this.query,$.proxy(this.process,this)):this.source,items?this.process(items):this)},process:function(items){var that=this;return items=$.grep(items,function(item){return that.matcher(item)}),items=this.sorter(items),items.length?this.render(items.slice(0,this.options.items)).show():this.shown?this.hide():this},matcher:function(item){return~item.toLowerCase().indexOf(this.query.toLowerCase())},sorter:function(items){for(var item,beginswith=[],caseSensitive=[],caseInsensitive=[];item=items.shift();)item.toLowerCase().indexOf(this.query.toLowerCase())?~item.indexOf(this.query)?caseSensitive.push(item):caseInsensitive.push(item):beginswith.push(item);return beginswith.concat(caseSensitive,caseInsensitive)},highlighter:function(item){var query=this.query.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g,"\\$&");return item.replace(RegExp("("+query+")","ig"),function($1,match){return"<strong>"+match+"</strong>"})},render:function(items){var that=this;return items=$(items).map(function(i,item){return i=$(that.options.item).attr("data-value",item),i.find("a").html(that.highlighter(item)),i[0]}),items.first().addClass("active"),this.$menu.html(items),this},next:function(){var active=this.$menu.find(".active").removeClass("active"),next=active.next();next.length||(next=$(this.$menu.find("li")[0])),next.addClass("active")},prev:function(){var active=this.$menu.find(".active").removeClass("active"),prev=active.prev();prev.length||(prev=this.$menu.find("li").last()),prev.addClass("active")},listen:function(){this.$element.on("blur",$.proxy(this.blur,this)).on("keypress",$.proxy(this.keypress,this)).on("keyup",$.proxy(this.keyup,this)),this.eventSupported("keydown")&&this.$element.on("keydown",$.proxy(this.keydown,this)),this.$menu.on("click",$.proxy(this.click,this)).on("mouseenter","li",$.proxy(this.mouseenter,this))},eventSupported:function(eventName){var isSupported=eventName in this.$element;return isSupported||(this.$element.setAttribute(eventName,"return;"),isSupported="function"==typeof this.$element[eventName]),isSupported},move:function(e){if(this.shown){switch(e.keyCode){case 9:case 13:case 27:e.preventDefault();break;case 38:e.preventDefault(),this.prev();break;case 40:e.preventDefault(),this.next()}e.stopPropagation()}},keydown:function(e){this.suppressKeyPressRepeat=~$.inArray(e.keyCode,[40,38,9,13,27]),this.move(e)},keypress:function(e){this.suppressKeyPressRepeat||this.move(e)},keyup:function(e){switch(e.keyCode){case 40:case 38:case 16:case 17:case 18:break;case 9:case 13:if(!this.shown)return;this.select();break;case 27:if(!this.shown)return;this.hide();break;default:this.lookup()}e.stopPropagation(),e.preventDefault()},blur:function(){var that=this;setTimeout(function(){that.hide()},150)},click:function(e){e.stopPropagation(),e.preventDefault(),this.select()},mouseenter:function(e){this.$menu.find(".active").removeClass("active"),$(e.currentTarget).addClass("active")}};var old=$.fn.typeahead;$.fn.typeahead=function(option){return this.each(function(){var $this=$(this),data=$this.data("typeahead"),options="object"==typeof option&&option;data||$this.data("typeahead",data=new Typeahead(this,options)),"string"==typeof option&&data[option]()})},$.fn.typeahead.defaults={source:[],items:8,menu:'<ul class="typeahead dropdown-menu"></ul>',item:'<li><a href="#"></a></li>',minLength:1},$.fn.typeahead.Constructor=Typeahead,$.fn.typeahead.noConflict=function(){return $.fn.typeahead=old,this},$(document).on("focus.typeahead.data-api",'[data-provide="typeahead"]',function(e){var $this=$(this);$this.data("typeahead")||(e.preventDefault(),$this.typeahead($this.data()))})}(window.jQuery),!function($){"use strict";var Affix=function(element,options){this.options=$.extend({},$.fn.affix.defaults,options),this.$window=$(window).on("scroll.affix.data-api",$.proxy(this.checkPosition,this)).on("click.affix.data-api",$.proxy(function(){setTimeout($.proxy(this.checkPosition,this),1)},this)),this.$element=$(element),this.checkPosition()};Affix.prototype.checkPosition=function(){if(this.$element.is(":visible")){var affix,scrollHeight=$(document).height(),scrollTop=this.$window.scrollTop(),position=this.$element.offset(),offset=this.options.offset,offsetBottom=offset.bottom,offsetTop=offset.top,reset="affix affix-top affix-bottom";"object"!=typeof offset&&(offsetBottom=offsetTop=offset),"function"==typeof offsetTop&&(offsetTop=offset.top()),"function"==typeof offsetBottom&&(offsetBottom=offset.bottom()),affix=null!=this.unpin&&scrollTop+this.unpin<=position.top?!1:null!=offsetBottom&&position.top+this.$element.height()>=scrollHeight-offsetBottom?"bottom":null!=offsetTop&&offsetTop>=scrollTop?"top":!1,this.affixed!==affix&&(this.affixed=affix,this.unpin="bottom"==affix?position.top-scrollTop:null,this.$element.removeClass(reset).addClass("affix"+(affix?"-"+affix:"")))}};var old=$.fn.affix;$.fn.affix=function(option){return this.each(function(){var $this=$(this),data=$this.data("affix"),options="object"==typeof option&&option;data||$this.data("affix",data=new Affix(this,options)),"string"==typeof option&&data[option]()})},$.fn.affix.Constructor=Affix,$.fn.affix.defaults={offset:0},$.fn.affix.noConflict=function(){return $.fn.affix=old,this},$(window).on("load",function(){$('[data-spy="affix"]').each(function(){var $spy=$(this),data=$spy.data();data.offset=data.offset||{},data.offsetBottom&&(data.offset.bottom=data.offsetBottom),data.offsetTop&&(data.offset.top=data.offsetTop),$spy.affix(data)})})}(window.jQuery);
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


(function(){function b(){return b}function c(b,d){var e=c.resolve(b),f=c.modules[e];if(!f)throw new Error('failed to require "'+b+'" from '+d);return f.exports||(f.exports={},f.call(f.exports,f,f.exports,c.relative(e),a)),f.exports}var a=this;c.modules={},c.resolve=function(a){var b=a,d=a+".js",e=a+"/index.js";return c.modules[d]&&d||c.modules[e]&&e||b},c.register=function(a,b){c.modules[a]=b},c.relative=function(a){return function(d){if("debug"==d)return b;if("."!=d.charAt(0))return c(d);var e=a.split("/"),f=d.split("/");e.pop();for(var g=0;g<f.length;g++){var h=f[g];".."==h?e.pop():"."!=h&&e.push(h)}return c(e.join("/"),a)}},c.register("color.js",function(a,b,c,d){var e=c("color-convert"),f=c("color-string");a.exports=function(a){return new g(a)};var g=function(a){this.values={rgb:[0,0,0],hsl:[0,0,0],hsv:[0,0,0],cmyk:[0,0,0,0],alpha:1};if(typeof a=="string"){var b=f.getRgba(a);b?this.setValues("rgb",b):(b=f.getHsla(a))&&this.setValues("hsl",b)}else if(typeof a=="object"){var b=a;b.r!==undefined||b.red!==undefined?this.setValues("rgb",b):b.l!==undefined||b.lightness!==undefined?this.setValues("hsl",b):b.v!==undefined||b.value!==undefined?this.setValues("hsv",b):(b.c!==undefined||b.cyan!==undefined)&&this.setValues("cmyk",b)}};g.prototype={rgb:function(a){return this.setSpace("rgb",arguments)},hsl:function(a){return this.setSpace("hsl",arguments)},hsv:function(a){return this.setSpace("hsv",arguments)},cmyk:function(a){return this.setSpace("cmyk",arguments)},rgbArray:function(){return this.values.rgb},hslArray:function(){return this.values.hsl},hsvArray:function(){return this.values.hsv},cmykArray:function(){return this.values.cmyk},rgbaArray:function(){var a=this.values.rgb;return a.push(this.values.alpha),a},hslaArray:function(){var a=this.values.hsl;return a.push(this.values.alpha),a},alpha:function(a){return a===undefined?this.values.alpha:(this.setValues("alpha",a),this)},red:function(a){return this.setChannel("rgb",0,a)},green:function(a){return this.setChannel("rgb",1,a)},blue:function(a){return this.setChannel("rgb",2,a)},hue:function(a){return this.setChannel("hsl",0,a)},saturation:function(a){return this.setChannel("hsl",1,a)},lightness:function(a){return this.setChannel("hsl",2,a)},saturationv:function(a){return this.setChannel("hsv",1,a)},value:function(a){return this.setChannel("hsv",2,a)},cyan:function(a){return this.setChannel("cmyk",0,a)},magenta:function(a){return this.setChannel("cmyk",1,a)},yellow:function(a){return this.setChannel("cmyk",2,a)},black:function(a){return this.setChannel("cmyk",3,a)},hexString:function(){return f.hexString(this.values.rgb)},rgbString:function(){return f.rgbString(this.values.rgb,this.values.alpha)},rgbaString:function(){return f.rgbaString(this.values.rgb,this.values.alpha)},percentString:function(){return f.percentString(this.values.rgb,this.values.alpha)},hslString:function(){return f.hslString(this.values.hsl,this.values.alpha)},hslaString:function(){return f.hslaString(this.values.hsl,this.values.alpha)},keyword:function(){return f.keyword(this.values.rgb,this.values.alpha)},luminosity:function(){var a=this.values.rgb;for(var b=0;b<a.length;b++){var c=a[b]/255;a[b]=c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)}return.2126*a[0]+.7152*a[1]+.0722*a[2]},contrast:function(a){var b=this.luminosity(),c=a.luminosity();return b>c?(b+.05)/(c+.05):(c+.05)/(b+.05)},dark:function(){var a=this.values.rgb,b=(a[0]*299+a[1]*587+a[2]*114)/1e3;return b<128},light:function(){return!this.dark()},negate:function(){var a=[];for(var b=0;b<3;b++)a[b]=255-this.values.rgb[b];return this.setValues("rgb",a),this},lighten:function(a){return this.values.hsl[2]+=this.values.hsl[2]*a,this.setValues("hsl",this.values.hsl),this},darken:function(a){return this.values.hsl[2]-=this.values.hsl[2]*a,this.setValues("hsl",this.values.hsl),this},saturate:function(a){return this.values.hsl[1]+=this.values.hsl[1]*a,this.setValues("hsl",this.values.hsl),this},desaturate:function(a){return this.values.hsl[1]-=this.values.hsl[1]*a,this.setValues("hsl",this.values.hsl),this},greyscale:function(){var a=this.values.rgb,b=a[0]*.3+a[1]*.59+a[2]*.11;return this.setValues("rgb",[b,b,b]),this},clearer:function(a){return this.setValues("alpha",this.values.alpha-this.values.alpha*a),this},opaquer:function(a){return this.setValues("alpha",this.values.alpha+this.values.alpha*a),this},rotate:function(a){var b=this.values.hsl[0];return b=(b+a)%360,b=b<0?360+b:b,this.values.hsl[0]=b,this.setValues("hsl",this.values.hsl),this},mix:function(a,b){b=1-(b||.5);var c=b*2-1,d=this.alpha()-a.alpha(),e=((c*d==-1?c:(c+d)/(1+c*d))+1)/2,f=1-e,g=this.rgbArray(),h=a.rgbArray();for(var i=0;i<g.length;i++)g[i]=g[i]*e+h[i]*f;this.setValues("rgb",g);var j=this.alpha()*b+a.alpha()*(1-b);return this.setValues("alpha",j),this},toJSON:function(){return this.rgb()}},g.prototype.getValues=function(a){var b={};for(var c=0;c<a.length;c++)b[a[c]]=this.values[a][c];return this.values.alpha!=1&&(b.a=this.values.alpha),b},g.prototype.setValues=function(a,b){var c={rgb:["red","green","blue"],hsl:["hue","saturation","lightness"],hsv:["hue","saturation","value"],cmyk:["cyan","magenta","yellow","black"]},d={rgb:[255,255,255],hsl:[360,100,100],hsv:[360,100,100],cmyk:[100,100,100,100]},f=1;if(a=="alpha")f=b;else if(b.length)this.values[a]=b.slice(0,a.length),f=b[a.length];else if(b[a[0]]!==undefined){for(var g=0;g<a.length;g++)this.values[a][g]=b[a[g]];f=b.a}else if(b[c[a][0]]!==undefined){var h=c[a];for(var g=0;g<a.length;g++)this.values[a][g]=b[h[g]];f=b.alpha}this.values.alpha=Math.max(0,Math.min(1,f||this.values.alpha));if(a=="alpha")return;for(var i in c){i!=a&&(this.values[i]=e[a][i](this.values[a]));for(var g=0;g<i.length;g++){var j=Math.max(0,Math.min(d[i][g],this.values[i][g]));this.values[i][g]=Math.round(j)}}return!0},g.prototype.setSpace=function(a,b){var c=b[0];return c===undefined?this.getValues(a):(typeof c=="number"&&(c=Array.prototype.slice.call(b)),this.setValues(a,c),this)},g.prototype.setChannel=function(a,b,c){return c===undefined?this.values[a][b]:(this.values[a][b]=c,this.setValues(a,this.values[a]),this)}}),c.register("color-string",function(a,b,c,d){function f(a){if(!a)return;var b=/^#([a-fA-F0-9]{3})$/,c=/^#([a-fA-F0-9]{6})$/,d=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d\.]+)\s*)?\)$/,f=/^rgba?\(\s*([\d\.]+)\%\s*,\s*([\d\.]+)\%\s*,\s*([\d\.]+)\%\s*(?:,\s*([\d\.]+)\s*)?\)$/,g=/(\D+)/,h=[0,0,0],i=1,j=a.match(b);if(j){j=j[1];for(var k=0;k<h.length;k++)h[k]=parseInt(j[k]+j[k],16)}else if(j=a.match(c)){j=j[1];for(var k=0;k<h.length;k++)h[k]=parseInt(j.slice(k*2,k*2+2),16)}else if(j=a.match(d)){for(var k=0;k<h.length;k++)h[k]=parseInt(j[k+1]);i=parseFloat(j[4])}else if(j=a.match(f)){for(var k=0;k<h.length;k++)h[k]=Math.round(parseFloat(j[k+1])*2.55);i=parseFloat(j[4])}else if(j=a.match(g)){if(j[1]=="transparent")return[0,0,0,0];h=e.keyword2rgb(j[1]);if(!h)return}for(var k=0;k<h.length;k++)h[k]=s(h[k],0,255);return i?i=s(i,0,1):i=1,h.push(i),h}function g(a){if(!a)return;var b=/^hsla?\(\s*(\d+)\s*,\s*([\d\.]+)%\s*,\s*([\d\.]+)%\s*(?:,\s*([\d\.]+)\s*)?\)/,c=a.match(b);if(c){var d=s(parseInt(c[1]),0,360),e=s(parseFloat(c[2]),0,100),f=s(parseFloat(c[3]),0,100),g=s(parseFloat(c[4])||1,0,1);return[d,e,f,g]}}function h(a){var b=f(a);return b&&b.slice(0,3)}function i(a){var b=g(a);return b&&b.slice(0,3)}function j(a){var b=f(a);if(b)return b[3];if(b=g(a))return b[3]}function k(a){return"#"+t(a[0])+t(a[1])+t(a[2])}function l(a,b){return b<1||a[3]&&a[3]<1?m(a,b):"rgb("+a[0]+", "+a[1]+", "+a[2]+")"}function m(a,b){return"rgba("+a[0]+", "+a[1]+", "+a[2]+", "+(b||a[3]||1)+")"}function n(a,b){if(b<1||a[3]&&a[3]<1)return o(a,b);var c=Math.round(a[0]/255*100),d=Math.round(a[1]/255*100),e=Math.round(a[2]/255*100);return"rgb("+c+"%, "+d+"%, "+e+"%)"}function o(a,b){var c=Math.round(a[0]/255*100),d=Math.round(a[1]/255*100),e=Math.round(a[2]/255*100);return"rgba("+c+"%, "+d+"%, "+e+"%, "+(b||a[3]||1)+")"}function p(a,b){return b<1||a[3]&&a[3]<1?q(a,b):"hsl("+a[0]+", "+a[1]+"%, "+a[2]+"%)"}function q(a,b){return"hsla("+a[0]+", "+a[1]+"%, "+a[2]+"%, "+(b||a[3]||1)+")"}function r(a){return e.rgb2keyword(a.slice(0,3))}function s(a,b,c){return Math.min(Math.max(b,a),c)}function t(a){var b=a.toString(16).toUpperCase();return b.length<2?"0"+b:b}var e=c("color-convert");a.exports={getRgba:f,getHsla:g,getRgb:h,getHsl:i,getAlpha:j,hexString:k,rgbString:l,rgbaString:m,percentString:n,percentaString:o,hslString:p,hslaString:q,keyword:r}}),c.register("color-convert",function(a,b,c,d){function l(a){for(var b=0;b<a.length;b++)a[b]=Math.round(a[b])}var e=c("conversions"),f=function(){return new k};for(var g in e){f[g+"Raw"]=function(a){return function(b){return typeof b=="number"&&(b=Array.prototype.slice.call(arguments)),e[a](b)}}(g);var h=/(\w+)2(\w+)/.exec(g),i=h[1],j=h[2];f[i]=f[i]||{},f[i][j]=f[g]=function(a){return function(b){typeof b=="number"&&(b=Array.prototype.slice.call(arguments));var c=e[a](b);return typeof c=="string"||c===undefined?c:(l(c),c)}}(g)}var k=function(){this.space="rgb",this.convs={rgb:[0,0,0]}};k.prototype.routeSpace=function(a,b){var c=b[0];return c===undefined?this.getValues(a):(typeof c=="number"&&(c=Array.prototype.slice.call(b)),this.setValues(a,c))},k.prototype.setValues=function(a,b){return this.space=a,this.convs={},this.convs[a]=b,this},k.prototype.getValues=function(a){var b=this.convs[a];if(!b){var c=this.space,d=this.convs[c];b=f[c][a](d),this.convs[a]=b}else l(b);return b},["rgb","hsl","hsv","cmyk","keyword"].forEach(function(a){k.prototype[a]=function(b){return this.routeSpace(a,arguments)}}),a.exports=f}),c.register("conversions",function(a,b,c,d){function e(a){var b=a[0]/255,c=a[1]/255,d=a[2]/255,e=Math.min(b,c,d),f=Math.max(b,c,d),g=f-e,h,i,j;return f==e?h=0:b==f?h=(c-d)/g:c==f?h=2+(d-b)/g:d==f&&(h=4+(b-c)/g),h=Math.min(h*60,360),h<0&&(h+=360),j=(e+f)/2,f==e?i=0:j<=.5?i=g/(f+e):i=g/(2-f-e),[h,i*100,j*100]}function f(a){var b=a[0],c=a[1],d=a[2],e=Math.min(b,c,d),f=Math.max(b,c,d),g=f-e,h,i,j;return f==0?i=0:i=g/f*1e3/10,f==e?h=0:b==f?h=(c-d)/g:c==f?h=2+(d-b)/g:d==f&&(h=4+(b-c)/g),h=Math.min(h*60,360),h<0&&(h+=360),j=f/255*1e3/10,[h,i,j]}function g(a){var b=a[0]/255,c=a[1]/255,d=a[2]/255,e,f,g,h;return h=Math.min(1-b,1-c,1-d),e=(1-b-h)/(1-h),f=(1-c-h)/(1-h),g=(1-d-h)/(1-h),[e*100,f*100,g*100,h*100]}function h(a){return G[JSON.stringify(a)]}function i(a){var b=a[0]/255,c=a[1]/255,d=a[2]/255;b=b>.04045?Math.pow((b+.055)/1.055,2.4):b/12.92,c=c>.04045?Math.pow((c+.055)/1.055,2.4):c/12.92,d=d>.04045?Math.pow((d+.055)/1.055,2.4):d/12.92;var e=b*.4124+c*.3576+d*.1805,f=b*.2126+c*.7152+d*.0722,g=b*.0193+c*.1192+d*.9505;return[e*100,f*100,g*100]}function j(a){var b=i(a),c=b[0],d=b[1],e=b[2],f,g,h;return c/=95.047,d/=100,e/=108.883,c=c>.008856?Math.pow(c,1/3):7.787*c+16/116,d=d>.008856?Math.pow(d,1/3):7.787*d+16/116,e=e>.008856?Math.pow(e,1/3):7.787*e+16/116,f=116*d-16,g=500*(c-d),h=200*(d-e),[f,g,h]}function k(a){var b=a[0]/360,c=a[1]/100,d=a[2]/100,e,f,g,h,i;if(c==0)return i=d*255,[i,i,i];d<.5?f=d*(1+c):f=d+c-d*c,e=2*d-f,h=[0,0,0];for(var j=0;j<3;j++)g=b+1/3*-(j-1),g<0&&g++,g>1&&g--,6*g<1?i=e+(f-e)*6*g:2*g<1?i=f:3*g<2?i=e+(f-e)*(2/3-g)*6:i=e,h[j]=i*255;return h}function l(a){var b=a[0],c=a[1]/100,d=a[2]/100,e,f;return d*=2,c*=d<=1?d:2-d,f=(d+c)/2,e=2*c/(d+c),[b,e*100,f*100]}function m(a){return g(k(a))}function n(a){return h(k(a))}function o(a){var b=a[0]/60,c=a[1]/100,d=a[2]/100,e=Math.floor(b)%6,f=b-Math.floor(b),g=255*d*(1-c),h=255*d*(1-c*f),i=255*d*(1-c*(1-f)),d=255*d;switch(e){case 0:return[d,i,g];case 1:return[h,d,g];case 2:return[g,d,i];case 3:return[g,h,d];case 4:return[i,g,d];case 5:return[d,g,h]}}function p(a){var b=a[0],c=a[1]/100,d=a[2]/100,e,f;return f=(2-c)*d,e=c*d,e/=f<=1?f:2-f,f/=2,[b,e*100,f*100]}function q(a){return g(o(a))}function r(a){return h(o(a))}function s(a){var b=a[0]/100,c=a[1]/100,d=a[2]/100,e=a[3]/100,f,g,h;return f=1-Math.min(1,b*(1-e)+e),g=1-Math.min(1,c*(1-e)+e),h=1-Math.min(1,d*(1-e)+e),[f*255,g*255,h*255]}function t(a){return e(s(a))}function u(a){return f(s(a))}function v(a){return h(s(a))}function w(a){var b=a[0]/100,c=a[1]/100,d=a[2]/100,e,f,g;return e=b*3.2406+c*-1.5372+d*-0.4986,f=b*-0.9689+c*1.8758+d*.0415,g=b*.0557+c*-0.204+d*1.057,e=e>.0031308?1.055*Math.pow(e,1/2.4)-.055:e*=12.92,f=f>.0031308?1.055*Math.pow(f,1/2.4)-.055:f*=12.92,g=g>.0031308?1.055*Math.pow(g,1/2.4)-.055:g*=12.92,e=e<0?0:e,f=f<0?0:f,g=g<0?0:g,[e*255,f*255,g*255]}function x(a){var b=a[0],c=a[1],d=a[2],e,f,g;return b/=95.047,c/=100,d/=108.883,b=b>.008856?Math.pow(b,1/3):7.787*b+16/116,c=c>.008856?Math.pow(c,1/3):7.787*c+16/116,d=d>.008856?Math.pow(d,1/3):7.787*d+16/116,e=116*c-16,f=500*(b-c),g=200*(c-d),[e,f,g]}function y(a){var b=a[0],c=a[1],d=a[2],e,f,g,h;return b<=8?(f=b*100/903.3,h=7.787*(f/100)+16/116):(f=100*Math.pow((b+16)/116,3),h=Math.pow(f/100,1/3)),e=e/95.047<=.008856?e=95.047*(c/500+h-16/116)/7.787:95.047*Math.pow(c/500+h,3),g=g/108.883<=.008859?g=108.883*(h-d/200-16/116)/7.787:108.883*Math.pow(h-d/200,3),[e,f,g]}function z(a){return F[a]}function A(a){return e(z(a))}function B(a){return f(z(a))}function C(a){return g(z(a))}function D(a){return j(z(a))}function E(a){return i(z(a))}a.exports={rgb2hsl:e,rgb2hsv:f,rgb2cmyk:g,rgb2keyword:h,rgb2xyz:i,rgb2lab:j,hsl2rgb:k,hsl2hsv:l,hsl2cmyk:m,hsl2keyword:n,hsv2rgb:o,hsv2hsl:p,hsv2cmyk:q,hsv2keyword:r,cmyk2rgb:s,cmyk2hsl:t,cmyk2hsv:u,cmyk2keyword:v,keyword2rgb:z,keyword2hsl:A,keyword2hsv:B,keyword2cmyk:C,keyword2lab:D,keyword2xyz:E,xyz2rgb:w,xyz2lab:x,lab2xyz:y};var F={aliceblue:[240,248,255],antiquewhite:[250,235,215],aqua:[0,255,255],aquamarine:[127,255,212],azure:[240,255,255],beige:[245,245,220],bisque:[255,228,196],black:[0,0,0],blanchedalmond:[255,235,205],blue:[0,0,255],blueviolet:[138,43,226],brown:[165,42,42],burlywood:[222,184,135],cadetblue:[95,158,160],chartreuse:[127,255,0],chocolate:[210,105,30],coral:[255,127,80],cornflowerblue:[100,149,237],cornsilk:[255,248,220],crimson:[220,20,60],cyan:[0,255,255],darkblue:[0,0,139],darkcyan:[0,139,139],darkgoldenrod:[184,134,11],darkgray:[169,169,169],darkgreen:[0,100,0],darkgrey:[169,169,169],darkkhaki:[189,183,107],darkmagenta:[139,0,139],darkolivegreen:[85,107,47],darkorange:[255,140,0],darkorchid:[153,50,204],darkred:[139,0,0],darksalmon:[233,150,122],darkseagreen:[143,188,143],darkslateblue:[72,61,139],darkslategray:[47,79,79],darkslategrey:[47,79,79],darkturquoise:[0,206,209],darkviolet:[148,0,211],deeppink:[255,20,147],deepskyblue:[0,191,255],dimgray:[105,105,105],dimgrey:[105,105,105],dodgerblue:[30,144,255],firebrick:[178,34,34],floralwhite:[255,250,240],forestgreen:[34,139,34],fuchsia:[255,0,255],gainsboro:[220,220,220],ghostwhite:[248,248,255],gold:[255,215,0],goldenrod:[218,165,32],gray:[128,128,128],green:[0,128,0],greenyellow:[173,255,47],grey:[128,128,128],honeydew:[240,255,240],hotpink:[255,105,180],indianred:[205,92,92],indigo:[75,0,130],ivory:[255,255,240],khaki:[240,230,140],lavender:[230,230,250],lavenderblush:[255,240,245],lawngreen:[124,252,0],lemonchiffon:[255,250,205],lightblue:[173,216,230],lightcoral:[240,128,128],lightcyan:[224,255,255],lightgoldenrodyellow:[250,250,210],lightgray:[211,211,211],lightgreen:[144,238,144],lightgrey:[211,211,211],lightpink:[255,182,193],lightsalmon:[255,160,122],lightseagreen:[32,178,170],lightskyblue:[135,206,250],lightslategray:[119,136,153],lightslategrey:[119,136,153],lightsteelblue:[176,196,222],lightyellow:[255,255,224],lime:[0,255,0],limegreen:[50,205,50],linen:[250,240,230],magenta:[255,0,255],maroon:[128,0,0],mediumaquamarine:[102,205,170],mediumblue:[0,0,205],mediumorchid:[186,85,211],mediumpurple:[147,112,219],mediumseagreen:[60,179,113],mediumslateblue:[123,104,238],mediumspringgreen:[0,250,154],mediumturquoise:[72,209,204],mediumvioletred:[199,21,133],midnightblue:[25,25,112],mintcream:[245,255,250],mistyrose:[255,228,225],moccasin:[255,228,181],navajowhite:[255,222,173],navy:[0,0,128],oldlace:[253,245,230],olive:[128,128,0],olivedrab:[107,142,35],orange:[255,165,0],orangered:[255,69,0],orchid:[218,112,214],palegoldenrod:[238,232,170],palegreen:[152,251,152],paleturquoise:[175,238,238],palevioletred:[219,112,147],papayawhip:[255,239,213],peachpuff:[255,218,185],peru:[205,133,63],pink:[255,192,203],plum:[221,160,221],powderblue:[176,224,230],purple:[128,0,128],red:[255,0,0],rosybrown:[188,143,143],royalblue:[65,105,225],saddlebrown:[139,69,19],salmon:[250,128,114],sandybrown:[244,164,96],seagreen:[46,139,87],seashell:[255,245,238],sienna:[160,82,45],silver:[192,192,192],skyblue:[135,206,235],slateblue:[106,90,205],slategray:[112,128,144],slategrey:[112,128,144],snow:[255,250,250],springgreen:[0,255,127],steelblue:[70,130,180],tan:[210,180,140],teal:[0,128,128],thistle:[216,191,216],tomato:[255,99,71],turquoise:[64,224,208],violet:[238,130,238],wheat:[245,222,179],white:[255,255,255],whitesmoke:[245,245,245],yellow:[255,255,0],yellowgreen:[154,205,50]},G={};for(var H in F)G[JSON.stringify(F[H])]=H}),Color=c("color.js")})();
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

//https://github.com/googledrive/cors-upload-sample/commits/master/upload.js
/**
 * Helper for implementing retries with backoff. Initial retry
 * delay is 1 second, increasing by 2x (+jitter) for subsequent retries
 *
 * @constructor
 */
var RetryHandler = function() {
  this.interval = 1000; // Start at one second
  this.maxInterval = 60 * 1000; // Don't wait longer than a minute
};

/**
 * Invoke the function after waiting
 *
 * @param {function} fn Function to invoke
 */
RetryHandler.prototype.retry = function(fn) {
  setTimeout(fn, this.interval);
  this.interval = this.nextInterval_();
};

/**
 * Reset the counter (e.g. after successful request.)
 */
RetryHandler.prototype.reset = function() {
  this.interval = 1000;
};

/**
 * Calculate the next wait time.
 * @return {number} Next wait interval, in milliseconds
 *
 * @private
 */
RetryHandler.prototype.nextInterval_ = function() {
  var interval = this.interval * 2 + this.getRandomInt_(0, 1000);
  return Math.min(interval, this.maxInterval);
};

/**
 * Get a random int in the range of min to max. Used to add jitter to wait times.
 *
 * @param {number} min Lower bounds
 * @param {number} max Upper bounds
 * @private
 */
RetryHandler.prototype.getRandomInt_ = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
};


/**
 * Helper class for resumable uploads using XHR/CORS. Can upload any Blob-like item, whether
 * files or in-memory constructs.
 *
 * @example
 * var content = new Blob(["Hello world"], {"type": "text/plain"});
 * var uploader = new MediaUploader({
 *   file: content,
 *   token: accessToken,
 *   onComplete: function(data) { ... }
 *   onError: function(data) { ... }
 * });
 * uploader.upload();
 *
 * @constructor
 * @param {object} options Hash of options
 * @param {string} options.token Access token
 * @param {blob} options.file Blob-like item to upload
 * @param {string} [options.fileId] ID of file if replacing
 * @param {object} [options.params] Additional query parameters
 * @param {string} [options.contentType] Content-type, if overriding the type of the blob.
 * @param {object} [options.metadata] File metadata
 * @param {function} [options.onComplete] Callback for when upload is complete
 * @param {function} [options.onProgress] Callback for status for the in-progress upload
 * @param {function} [options.onError] Callback if upload fails
 */
var MediaUploader = function(options) {
  var noop = function() {};
  this.file = options.file;
  this.contentType = options.contentType || this.file.type || 'application/octet-stream';
  this.metadata = options.metadata || {
    'title': this.file.name,
    'mimeType': this.contentType
  };
  this.token = options.token;
  this.onComplete = options.onComplete || noop;
  this.onProgress = options.onProgress || noop;
  this.onError = options.onError || noop;
  this.offset = options.offset || 0;
  this.chunkSize = options.chunkSize || 0;
  this.retryHandler = new RetryHandler();

  this.url = options.url;
  if (!this.url) {
    var params = options.params || {};
    params.uploadType = 'resumable';
    this.url = this.buildUrl_(options.fileId, params, options.baseUrl);
  }
  this.httpMethod = options.fileId ? 'PUT' : 'POST';
};

/**
 * Initiate the upload.
 */
MediaUploader.prototype.upload = function() {
  var self = this;
  var xhr = new XMLHttpRequest();

  xhr.open(this.httpMethod, this.url, true);
  xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('X-Upload-Content-Length', this.file.size);
  xhr.setRequestHeader('X-Upload-Content-Type', this.contentType);

  xhr.onload = function(e) {
    if (e.target.status < 400) {
      var location = e.target.getResponseHeader('Location');
      this.url = location;
      this.sendFile_();
    } else {
      this.onUploadError_(e);
    }
  }.bind(this);
  xhr.onerror = this.onUploadError_.bind(this);
  xhr.send(JSON.stringify(this.metadata));
};

/**
 * Send the actual file content.
 *
 * @private
 */
MediaUploader.prototype.sendFile_ = function() {
  var content = this.file;
  var end = this.file.size;

  if (this.offset || this.chunkSize) {
    // Only bother to slice the file if we're either resuming or uploading in chunks
    if (this.chunkSize) {
      end = Math.min(this.offset + this.chunkSize, this.file.size);
    }
    content = content.slice(this.offset, end);
  }

  var xhr = new XMLHttpRequest();
  xhr.open('PUT', this.url, true);
  xhr.setRequestHeader('Content-Type', this.contentType);
  xhr.setRequestHeader('Content-Range', "bytes " + this.offset + "-" + (end - 1) + "/" + this.file.size);
  xhr.setRequestHeader('X-Upload-Content-Type', this.file.type);
  if (xhr.upload) {
    xhr.upload.addEventListener('progress', this.onProgress);
  }
  xhr.onload = this.onContentUploadSuccess_.bind(this);
  xhr.onerror = this.onContentUploadError_.bind(this);
  xhr.send(content);
};

/**
 * Query for the state of the file for resumption.
 *
 * @private
 */
MediaUploader.prototype.resume_ = function() {
  var xhr = new XMLHttpRequest();
  xhr.open('PUT', this.url, true);
  xhr.setRequestHeader('Content-Range', "bytes */" + this.file.size);
  xhr.setRequestHeader('X-Upload-Content-Type', this.file.type);
  if (xhr.upload) {
    xhr.upload.addEventListener('progress', this.onProgress);
  }
  xhr.onload = this.onContentUploadSuccess_.bind(this);
  xhr.onerror = this.onContentUploadError_.bind(this);
  xhr.send();
};

/**
 * Extract the last saved range if available in the request.
 *
 * @param {XMLHttpRequest} xhr Request object
 */
MediaUploader.prototype.extractRange_ = function(xhr) {
  var range = xhr.getResponseHeader('Range');
  if (range) {
    this.offset = parseInt(range.match(/\d+/g).pop(), 10) + 1;
  }
};

/**
 * Handle successful responses for uploads. Depending on the context,
 * may continue with uploading the next chunk of the file or, if complete,
 * invokes the caller's callback.
 *
 * @private
 * @param {object} e XHR event
 */
MediaUploader.prototype.onContentUploadSuccess_ = function(e) {
  if (e.target.status == 200 || e.target.status == 201) {
    this.onComplete(e.target.response);
  } else if (e.target.status == 308) {
    this.extractRange_(e.target);
    this.retryHandler.reset();
    this.sendFile_();
  }
};

/**
 * Handles errors for uploads. Either retries or aborts depending
 * on the error.
 *
 * @private
 * @param {object} e XHR event
 */
MediaUploader.prototype.onContentUploadError_ = function(e) {
  if (e.target.status && e.target.status < 500) {
    this.onError(e.target.response);
  } else {
    this.retryHandler.retry(this.resume_.bind(this));
  }
};

/**
 * Handles errors for the initial request.
 *
 * @private
 * @param {object} e XHR event
 */
MediaUploader.prototype.onUploadError_ = function(e) {
  this.onError(e.target.response); // TODO - Retries for initial upload
};

/**
 * Construct a query string from a hash/object
 *
 * @private
 * @param {object} [params] Key/value pairs for query string
 * @return {string} query string
 */
MediaUploader.prototype.buildQuery_ = function(params) {
  params = params || {};
  return Object.keys(params).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
};

/**
 * Build the drive upload URL
 *
 * @private
 * @param {string} [id] File ID if replacing
 * @param {object} [params] Query parameters
 * @return {string} URL
 */
MediaUploader.prototype.buildUrl_ = function(id, params, baseUrl) {
  var url = baseUrl || 'https://www.googleapis.com/upload/drive/v2/files/';
  if (id) {
    url += id;
  }
  var query = this.buildQuery_(params);
  if (query) {
    url += '?' + query;
  }
  return url;
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

/*! Hammer.JS - v1.1.3 - 2014-05-20
 * http://eightmedia.github.io/hammer.js
 *
 * Copyright (c) 2014 Jorik Tangelder <j.tangelder@gmail.com>;
 * Licensed under the MIT license */


!function(a,b){"use strict";function c(){d.READY||(s.determineEventTypes(),r.each(d.gestures,function(a){u.register(a)}),s.onTouch(d.DOCUMENT,n,u.detect),s.onTouch(d.DOCUMENT,o,u.detect),d.READY=!0)}var d=function v(a,b){return new v.Instance(a,b||{})};d.VERSION="1.1.3",d.defaults={behavior:{userSelect:"none",touchAction:"pan-y",touchCallout:"none",contentZooming:"none",userDrag:"none",tapHighlightColor:"rgba(0,0,0,0)"}},d.DOCUMENT=document,d.HAS_POINTEREVENTS=navigator.pointerEnabled||navigator.msPointerEnabled,d.HAS_TOUCHEVENTS="ontouchstart"in a,d.IS_MOBILE=/mobile|tablet|ip(ad|hone|od)|android|silk/i.test(navigator.userAgent),d.NO_MOUSEEVENTS=d.HAS_TOUCHEVENTS&&d.IS_MOBILE||d.HAS_POINTEREVENTS,d.CALCULATE_INTERVAL=25;var e={},f=d.DIRECTION_DOWN="down",g=d.DIRECTION_LEFT="left",h=d.DIRECTION_UP="up",i=d.DIRECTION_RIGHT="right",j=d.POINTER_MOUSE="mouse",k=d.POINTER_TOUCH="touch",l=d.POINTER_PEN="pen",m=d.EVENT_START="start",n=d.EVENT_MOVE="move",o=d.EVENT_END="end",p=d.EVENT_RELEASE="release",q=d.EVENT_TOUCH="touch";d.READY=!1,d.plugins=d.plugins||{},d.gestures=d.gestures||{};var r=d.utils={extend:function(a,c,d){for(var e in c)!c.hasOwnProperty(e)||a[e]!==b&&d||(a[e]=c[e]);return a},on:function(a,b,c){a.addEventListener(b,c,!1)},off:function(a,b,c){a.removeEventListener(b,c,!1)},each:function(a,c,d){var e,f;if("forEach"in a)a.forEach(c,d);else if(a.length!==b){for(e=0,f=a.length;f>e;e++)if(c.call(d,a[e],e,a)===!1)return}else for(e in a)if(a.hasOwnProperty(e)&&c.call(d,a[e],e,a)===!1)return},inStr:function(a,b){return a.indexOf(b)>-1},inArray:function(a,b){if(a.indexOf){var c=a.indexOf(b);return-1===c?!1:c}for(var d=0,e=a.length;e>d;d++)if(a[d]===b)return d;return!1},toArray:function(a){return Array.prototype.slice.call(a,0)},hasParent:function(a,b){for(;a;){if(a==b)return!0;a=a.parentNode}return!1},getCenter:function(a){var b=[],c=[],d=[],e=[],f=Math.min,g=Math.max;return 1===a.length?{pageX:a[0].pageX,pageY:a[0].pageY,clientX:a[0].clientX,clientY:a[0].clientY}:(r.each(a,function(a){b.push(a.pageX),c.push(a.pageY),d.push(a.clientX),e.push(a.clientY)}),{pageX:(f.apply(Math,b)+g.apply(Math,b))/2,pageY:(f.apply(Math,c)+g.apply(Math,c))/2,clientX:(f.apply(Math,d)+g.apply(Math,d))/2,clientY:(f.apply(Math,e)+g.apply(Math,e))/2})},getVelocity:function(a,b,c){return{x:Math.abs(b/a)||0,y:Math.abs(c/a)||0}},getAngle:function(a,b){var c=b.clientX-a.clientX,d=b.clientY-a.clientY;return 180*Math.atan2(d,c)/Math.PI},getDirection:function(a,b){var c=Math.abs(a.clientX-b.clientX),d=Math.abs(a.clientY-b.clientY);return c>=d?a.clientX-b.clientX>0?g:i:a.clientY-b.clientY>0?h:f},getDistance:function(a,b){var c=b.clientX-a.clientX,d=b.clientY-a.clientY;return Math.sqrt(c*c+d*d)},getScale:function(a,b){return a.length>=2&&b.length>=2?this.getDistance(b[0],b[1])/this.getDistance(a[0],a[1]):1},getRotation:function(a,b){return a.length>=2&&b.length>=2?this.getAngle(b[1],b[0])-this.getAngle(a[1],a[0]):0},isVertical:function(a){return a==h||a==f},setPrefixedCss:function(a,b,c,d){var e=["","Webkit","Moz","O","ms"];b=r.toCamelCase(b);for(var f=0;f<e.length;f++){var g=b;if(e[f]&&(g=e[f]+g.slice(0,1).toUpperCase()+g.slice(1)),g in a.style){a.style[g]=(null==d||d)&&c||"";break}}},toggleBehavior:function(a,b,c){if(b&&a&&a.style){r.each(b,function(b,d){r.setPrefixedCss(a,d,b,c)});var d=c&&function(){return!1};"none"==b.userSelect&&(a.onselectstart=d),"none"==b.userDrag&&(a.ondragstart=d)}},toCamelCase:function(a){return a.replace(/[_-]([a-z])/g,function(a){return a[1].toUpperCase()})}},s=d.event={preventMouseEvents:!1,started:!1,shouldDetect:!1,on:function(a,b,c,d){var e=b.split(" ");r.each(e,function(b){r.on(a,b,c),d&&d(b)})},off:function(a,b,c,d){var e=b.split(" ");r.each(e,function(b){r.off(a,b,c),d&&d(b)})},onTouch:function(a,b,c){var f=this,g=function(e){var g,h=e.type.toLowerCase(),i=d.HAS_POINTEREVENTS,j=r.inStr(h,"mouse");j&&f.preventMouseEvents||(j&&b==m&&0===e.button?(f.preventMouseEvents=!1,f.shouldDetect=!0):i&&b==m?f.shouldDetect=1===e.buttons||t.matchType(k,e):j||b!=m||(f.preventMouseEvents=!0,f.shouldDetect=!0),i&&b!=o&&t.updatePointer(b,e),f.shouldDetect&&(g=f.doDetect.call(f,e,b,a,c)),g==o&&(f.preventMouseEvents=!1,f.shouldDetect=!1,t.reset()),i&&b==o&&t.updatePointer(b,e))};return this.on(a,e[b],g),g},doDetect:function(a,b,c,d){var e=this.getTouchList(a,b),f=e.length,g=b,h=e.trigger,i=f;b==m?h=q:b==o&&(h=p,i=e.length-(a.changedTouches?a.changedTouches.length:1)),i>0&&this.started&&(g=n),this.started=!0;var j=this.collectEventData(c,g,e,a);return b!=o&&d.call(u,j),h&&(j.changedLength=i,j.eventType=h,d.call(u,j),j.eventType=g,delete j.changedLength),g==o&&(d.call(u,j),this.started=!1),g},determineEventTypes:function(){var b;return b=d.HAS_POINTEREVENTS?a.PointerEvent?["pointerdown","pointermove","pointerup pointercancel lostpointercapture"]:["MSPointerDown","MSPointerMove","MSPointerUp MSPointerCancel MSLostPointerCapture"]:d.NO_MOUSEEVENTS?["touchstart","touchmove","touchend touchcancel"]:["touchstart mousedown","touchmove mousemove","touchend touchcancel mouseup"],e[m]=b[0],e[n]=b[1],e[o]=b[2],e},getTouchList:function(a,b){if(d.HAS_POINTEREVENTS)return t.getTouchList();if(a.touches){if(b==n)return a.touches;var c=[],e=[].concat(r.toArray(a.touches),r.toArray(a.changedTouches)),f=[];return r.each(e,function(a){r.inArray(c,a.identifier)===!1&&f.push(a),c.push(a.identifier)}),f}return a.identifier=1,[a]},collectEventData:function(a,b,c,d){var e=k;return r.inStr(d.type,"mouse")||t.matchType(j,d)?e=j:t.matchType(l,d)&&(e=l),{center:r.getCenter(c),timeStamp:Date.now(),target:d.target,touches:c,eventType:b,pointerType:e,srcEvent:d,preventDefault:function(){var a=this.srcEvent;a.preventManipulation&&a.preventManipulation(),a.preventDefault&&a.preventDefault()},stopPropagation:function(){this.srcEvent.stopPropagation()},stopDetect:function(){return u.stopDetect()}}}},t=d.PointerEvent={pointers:{},getTouchList:function(){var a=[];return r.each(this.pointers,function(b){a.push(b)}),a},updatePointer:function(a,b){a==o||a!=o&&1!==b.buttons?delete this.pointers[b.pointerId]:(b.identifier=b.pointerId,this.pointers[b.pointerId]=b)},matchType:function(a,b){if(!b.pointerType)return!1;var c=b.pointerType,d={};return d[j]=c===(b.MSPOINTER_TYPE_MOUSE||j),d[k]=c===(b.MSPOINTER_TYPE_TOUCH||k),d[l]=c===(b.MSPOINTER_TYPE_PEN||l),d[a]},reset:function(){this.pointers={}}},u=d.detection={gestures:[],current:null,previous:null,stopped:!1,startDetect:function(a,b){this.current||(this.stopped=!1,this.current={inst:a,startEvent:r.extend({},b),lastEvent:!1,lastCalcEvent:!1,futureCalcEvent:!1,lastCalcData:{},name:""},this.detect(b))},detect:function(a){if(this.current&&!this.stopped){a=this.extendEventData(a);var b=this.current.inst,c=b.options;return r.each(this.gestures,function(d){!this.stopped&&b.enabled&&c[d.name]&&d.handler.call(d,a,b)},this),this.current&&(this.current.lastEvent=a),a.eventType==o&&this.stopDetect(),a}},stopDetect:function(){this.previous=r.extend({},this.current),this.current=null,this.stopped=!0},getCalculatedData:function(a,b,c,e,f){var g=this.current,h=!1,i=g.lastCalcEvent,j=g.lastCalcData;i&&a.timeStamp-i.timeStamp>d.CALCULATE_INTERVAL&&(b=i.center,c=a.timeStamp-i.timeStamp,e=a.center.clientX-i.center.clientX,f=a.center.clientY-i.center.clientY,h=!0),(a.eventType==q||a.eventType==p)&&(g.futureCalcEvent=a),(!g.lastCalcEvent||h)&&(j.velocity=r.getVelocity(c,e,f),j.angle=r.getAngle(b,a.center),j.direction=r.getDirection(b,a.center),g.lastCalcEvent=g.futureCalcEvent||a,g.futureCalcEvent=a),a.velocityX=j.velocity.x,a.velocityY=j.velocity.y,a.interimAngle=j.angle,a.interimDirection=j.direction},extendEventData:function(a){var b=this.current,c=b.startEvent,d=b.lastEvent||c;(a.eventType==q||a.eventType==p)&&(c.touches=[],r.each(a.touches,function(a){c.touches.push({clientX:a.clientX,clientY:a.clientY})}));var e=a.timeStamp-c.timeStamp,f=a.center.clientX-c.center.clientX,g=a.center.clientY-c.center.clientY;return this.getCalculatedData(a,d.center,e,f,g),r.extend(a,{startEvent:c,deltaTime:e,deltaX:f,deltaY:g,distance:r.getDistance(c.center,a.center),angle:r.getAngle(c.center,a.center),direction:r.getDirection(c.center,a.center),scale:r.getScale(c.touches,a.touches),rotation:r.getRotation(c.touches,a.touches)}),a},register:function(a){var c=a.defaults||{};return c[a.name]===b&&(c[a.name]=!0),r.extend(d.defaults,c,!0),a.index=a.index||1e3,this.gestures.push(a),this.gestures.sort(function(a,b){return a.index<b.index?-1:a.index>b.index?1:0}),this.gestures}};d.Instance=function(a,b){var e=this;c(),this.element=a,this.enabled=!0,r.each(b,function(a,c){delete b[c],b[r.toCamelCase(c)]=a}),this.options=r.extend(r.extend({},d.defaults),b||{}),this.options.behavior&&r.toggleBehavior(this.element,this.options.behavior,!0),this.eventStartHandler=s.onTouch(a,m,function(a){e.enabled&&a.eventType==m?u.startDetect(e,a):a.eventType==q&&u.detect(a)}),this.eventHandlers=[]},d.Instance.prototype={on:function(a,b){var c=this;return s.on(c.element,a,b,function(a){c.eventHandlers.push({gesture:a,handler:b})}),c},off:function(a,b){var c=this;return s.off(c.element,a,b,function(a){var d=r.inArray({gesture:a,handler:b});d!==!1&&c.eventHandlers.splice(d,1)}),c},trigger:function(a,b){b||(b={});var c=d.DOCUMENT.createEvent("Event");c.initEvent(a,!0,!0),c.gesture=b;var e=this.element;return r.hasParent(b.target,e)&&(e=b.target),e.dispatchEvent(c),this},enable:function(a){return this.enabled=a,this},dispose:function(){var a,b;for(r.toggleBehavior(this.element,this.options.behavior,!1),a=-1;b=this.eventHandlers[++a];)r.off(this.element,b.gesture,b.handler);return this.eventHandlers=[],s.off(this.element,e[m],this.eventStartHandler),null}},function(a){function b(b,d){var e=u.current;if(!(d.options.dragMaxTouches>0&&b.touches.length>d.options.dragMaxTouches))switch(b.eventType){case m:c=!1;break;case n:if(b.distance<d.options.dragMinDistance&&e.name!=a)return;var j=e.startEvent.center;if(e.name!=a&&(e.name=a,d.options.dragDistanceCorrection&&b.distance>0)){var k=Math.abs(d.options.dragMinDistance/b.distance);j.pageX+=b.deltaX*k,j.pageY+=b.deltaY*k,j.clientX+=b.deltaX*k,j.clientY+=b.deltaY*k,b=u.extendEventData(b)}(e.lastEvent.dragLockToAxis||d.options.dragLockToAxis&&d.options.dragLockMinDistance<=b.distance)&&(b.dragLockToAxis=!0);var l=e.lastEvent.direction;b.dragLockToAxis&&l!==b.direction&&(b.direction=r.isVertical(l)?b.deltaY<0?h:f:b.deltaX<0?g:i),c||(d.trigger(a+"start",b),c=!0),d.trigger(a,b),d.trigger(a+b.direction,b);var q=r.isVertical(b.direction);(d.options.dragBlockVertical&&q||d.options.dragBlockHorizontal&&!q)&&b.preventDefault();break;case p:c&&b.changedLength<=d.options.dragMaxTouches&&(d.trigger(a+"end",b),c=!1);break;case o:c=!1}}var c=!1;d.gestures.Drag={name:a,index:50,handler:b,defaults:{dragMinDistance:10,dragDistanceCorrection:!0,dragMaxTouches:1,dragBlockHorizontal:!1,dragBlockVertical:!1,dragLockToAxis:!1,dragLockMinDistance:25}}}("drag"),d.gestures.Gesture={name:"gesture",index:1337,handler:function(a,b){b.trigger(this.name,a)}},function(a){function b(b,d){var e=d.options,f=u.current;switch(b.eventType){case m:clearTimeout(c),f.name=a,c=setTimeout(function(){f&&f.name==a&&d.trigger(a,b)},e.holdTimeout);break;case n:b.distance>e.holdThreshold&&clearTimeout(c);break;case p:clearTimeout(c)}}var c;d.gestures.Hold={name:a,index:10,defaults:{holdTimeout:500,holdThreshold:2},handler:b}}("hold"),d.gestures.Release={name:"release",index:1/0,handler:function(a,b){a.eventType==p&&b.trigger(this.name,a)}},d.gestures.Swipe={name:"swipe",index:40,defaults:{swipeMinTouches:1,swipeMaxTouches:1,swipeVelocityX:.6,swipeVelocityY:.6},handler:function(a,b){if(a.eventType==p){var c=a.touches.length,d=b.options;if(c<d.swipeMinTouches||c>d.swipeMaxTouches)return;(a.velocityX>d.swipeVelocityX||a.velocityY>d.swipeVelocityY)&&(b.trigger(this.name,a),b.trigger(this.name+a.direction,a))}}},function(a){function b(b,d){var e,f,g=d.options,h=u.current,i=u.previous;switch(b.eventType){case m:c=!1;break;case n:c=c||b.distance>g.tapMaxDistance;break;case o:!r.inStr(b.srcEvent.type,"cancel")&&b.deltaTime<g.tapMaxTime&&!c&&(e=i&&i.lastEvent&&b.timeStamp-i.lastEvent.timeStamp,f=!1,i&&i.name==a&&e&&e<g.doubleTapInterval&&b.distance<g.doubleTapDistance&&(d.trigger("doubletap",b),f=!0),(!f||g.tapAlways)&&(h.name=a,d.trigger(h.name,b)))}}var c=!1;d.gestures.Tap={name:a,index:100,handler:b,defaults:{tapMaxTime:250,tapMaxDistance:10,tapAlways:!0,doubleTapDistance:20,doubleTapInterval:300}}}("tap"),d.gestures.Touch={name:"touch",index:-1/0,defaults:{preventDefault:!1,preventMouse:!1},handler:function(a,b){return b.options.preventMouse&&a.pointerType==j?void a.stopDetect():(b.options.preventDefault&&a.preventDefault(),void(a.eventType==q&&b.trigger("touch",a)))}},function(a){function b(b,d){switch(b.eventType){case m:c=!1;break;case n:if(b.touches.length<2)return;var e=Math.abs(1-b.scale),f=Math.abs(b.rotation);if(e<d.options.transformMinScale&&f<d.options.transformMinRotation)return;u.current.name=a,c||(d.trigger(a+"start",b),c=!0),d.trigger(a,b),f>d.options.transformMinRotation&&d.trigger("rotate",b),e>d.options.transformMinScale&&(d.trigger("pinch",b),d.trigger("pinch"+(b.scale<1?"in":"out"),b));break;case p:c&&b.changedLength<2&&(d.trigger(a+"end",b),c=!1)}}var c=!1;d.gestures.Transform={name:a,index:45,defaults:{transformMinScale:.01,transformMinRotation:1},handler:b}}("transform"),"function"==typeof define&&define.amd?define(function(){return d}):"undefined"!=typeof module&&module.exports?module.exports=d:a.Hammer=d}(window);

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

/*! jQuery v1.9.1 | (c) 2005, 2012 jQuery Foundation, Inc. | jquery.org/license
//@ sourceMappingURL=jquery.min.map
*/(function(e,t){var n,r,i=typeof t,o=e.document,a=e.location,s=e.jQuery,u=e.$,l={},c=[],p="1.9.1",f=c.concat,d=c.push,h=c.slice,g=c.indexOf,m=l.toString,y=l.hasOwnProperty,v=p.trim,b=function(e,t){return new b.fn.init(e,t,r)},x=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,w=/\S+/g,T=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,N=/^(?:(<[\w\W]+>)[^>]*|#([\w-]*))$/,C=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,k=/^[\],:{}\s]*$/,E=/(?:^|:|,)(?:\s*\[)+/g,S=/\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,A=/"[^"\\\r\n]*"|true|false|null|-?(?:\d+\.|)\d+(?:[eE][+-]?\d+|)/g,j=/^-ms-/,D=/-([\da-z])/gi,L=function(e,t){return t.toUpperCase()},H=function(e){(o.addEventListener||"load"===e.type||"complete"===o.readyState)&&(q(),b.ready())},q=function(){o.addEventListener?(o.removeEventListener("DOMContentLoaded",H,!1),e.removeEventListener("load",H,!1)):(o.detachEvent("onreadystatechange",H),e.detachEvent("onload",H))};b.fn=b.prototype={jquery:p,constructor:b,init:function(e,n,r){var i,a;if(!e)return this;if("string"==typeof e){if(i="<"===e.charAt(0)&&">"===e.charAt(e.length-1)&&e.length>=3?[null,e,null]:N.exec(e),!i||!i[1]&&n)return!n||n.jquery?(n||r).find(e):this.constructor(n).find(e);if(i[1]){if(n=n instanceof b?n[0]:n,b.merge(this,b.parseHTML(i[1],n&&n.nodeType?n.ownerDocument||n:o,!0)),C.test(i[1])&&b.isPlainObject(n))for(i in n)b.isFunction(this[i])?this[i](n[i]):this.attr(i,n[i]);return this}if(a=o.getElementById(i[2]),a&&a.parentNode){if(a.id!==i[2])return r.find(e);this.length=1,this[0]=a}return this.context=o,this.selector=e,this}return e.nodeType?(this.context=this[0]=e,this.length=1,this):b.isFunction(e)?r.ready(e):(e.selector!==t&&(this.selector=e.selector,this.context=e.context),b.makeArray(e,this))},selector:"",length:0,size:function(){return this.length},toArray:function(){return h.call(this)},get:function(e){return null==e?this.toArray():0>e?this[this.length+e]:this[e]},pushStack:function(e){var t=b.merge(this.constructor(),e);return t.prevObject=this,t.context=this.context,t},each:function(e,t){return b.each(this,e,t)},ready:function(e){return b.ready.promise().done(e),this},slice:function(){return this.pushStack(h.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(e){var t=this.length,n=+e+(0>e?t:0);return this.pushStack(n>=0&&t>n?[this[n]]:[])},map:function(e){return this.pushStack(b.map(this,function(t,n){return e.call(t,n,t)}))},end:function(){return this.prevObject||this.constructor(null)},push:d,sort:[].sort,splice:[].splice},b.fn.init.prototype=b.fn,b.extend=b.fn.extend=function(){var e,n,r,i,o,a,s=arguments[0]||{},u=1,l=arguments.length,c=!1;for("boolean"==typeof s&&(c=s,s=arguments[1]||{},u=2),"object"==typeof s||b.isFunction(s)||(s={}),l===u&&(s=this,--u);l>u;u++)if(null!=(o=arguments[u]))for(i in o)e=s[i],r=o[i],s!==r&&(c&&r&&(b.isPlainObject(r)||(n=b.isArray(r)))?(n?(n=!1,a=e&&b.isArray(e)?e:[]):a=e&&b.isPlainObject(e)?e:{},s[i]=b.extend(c,a,r)):r!==t&&(s[i]=r));return s},b.extend({noConflict:function(t){return e.$===b&&(e.$=u),t&&e.jQuery===b&&(e.jQuery=s),b},isReady:!1,readyWait:1,holdReady:function(e){e?b.readyWait++:b.ready(!0)},ready:function(e){if(e===!0?!--b.readyWait:!b.isReady){if(!o.body)return setTimeout(b.ready);b.isReady=!0,e!==!0&&--b.readyWait>0||(n.resolveWith(o,[b]),b.fn.trigger&&b(o).trigger("ready").off("ready"))}},isFunction:function(e){return"function"===b.type(e)},isArray:Array.isArray||function(e){return"array"===b.type(e)},isWindow:function(e){return null!=e&&e==e.window},isNumeric:function(e){return!isNaN(parseFloat(e))&&isFinite(e)},type:function(e){return null==e?e+"":"object"==typeof e||"function"==typeof e?l[m.call(e)]||"object":typeof e},isPlainObject:function(e){if(!e||"object"!==b.type(e)||e.nodeType||b.isWindow(e))return!1;try{if(e.constructor&&!y.call(e,"constructor")&&!y.call(e.constructor.prototype,"isPrototypeOf"))return!1}catch(n){return!1}var r;for(r in e);return r===t||y.call(e,r)},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},error:function(e){throw Error(e)},parseHTML:function(e,t,n){if(!e||"string"!=typeof e)return null;"boolean"==typeof t&&(n=t,t=!1),t=t||o;var r=C.exec(e),i=!n&&[];return r?[t.createElement(r[1])]:(r=b.buildFragment([e],t,i),i&&b(i).remove(),b.merge([],r.childNodes))},parseJSON:function(n){return e.JSON&&e.JSON.parse?e.JSON.parse(n):null===n?n:"string"==typeof n&&(n=b.trim(n),n&&k.test(n.replace(S,"@").replace(A,"]").replace(E,"")))?Function("return "+n)():(b.error("Invalid JSON: "+n),t)},parseXML:function(n){var r,i;if(!n||"string"!=typeof n)return null;try{e.DOMParser?(i=new DOMParser,r=i.parseFromString(n,"text/xml")):(r=new ActiveXObject("Microsoft.XMLDOM"),r.async="false",r.loadXML(n))}catch(o){r=t}return r&&r.documentElement&&!r.getElementsByTagName("parsererror").length||b.error("Invalid XML: "+n),r},noop:function(){},globalEval:function(t){t&&b.trim(t)&&(e.execScript||function(t){e.eval.call(e,t)})(t)},camelCase:function(e){return e.replace(j,"ms-").replace(D,L)},nodeName:function(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()},each:function(e,t,n){var r,i=0,o=e.length,a=M(e);if(n){if(a){for(;o>i;i++)if(r=t.apply(e[i],n),r===!1)break}else for(i in e)if(r=t.apply(e[i],n),r===!1)break}else if(a){for(;o>i;i++)if(r=t.call(e[i],i,e[i]),r===!1)break}else for(i in e)if(r=t.call(e[i],i,e[i]),r===!1)break;return e},trim:v&&!v.call("\ufeff\u00a0")?function(e){return null==e?"":v.call(e)}:function(e){return null==e?"":(e+"").replace(T,"")},makeArray:function(e,t){var n=t||[];return null!=e&&(M(Object(e))?b.merge(n,"string"==typeof e?[e]:e):d.call(n,e)),n},inArray:function(e,t,n){var r;if(t){if(g)return g.call(t,e,n);for(r=t.length,n=n?0>n?Math.max(0,r+n):n:0;r>n;n++)if(n in t&&t[n]===e)return n}return-1},merge:function(e,n){var r=n.length,i=e.length,o=0;if("number"==typeof r)for(;r>o;o++)e[i++]=n[o];else while(n[o]!==t)e[i++]=n[o++];return e.length=i,e},grep:function(e,t,n){var r,i=[],o=0,a=e.length;for(n=!!n;a>o;o++)r=!!t(e[o],o),n!==r&&i.push(e[o]);return i},map:function(e,t,n){var r,i=0,o=e.length,a=M(e),s=[];if(a)for(;o>i;i++)r=t(e[i],i,n),null!=r&&(s[s.length]=r);else for(i in e)r=t(e[i],i,n),null!=r&&(s[s.length]=r);return f.apply([],s)},guid:1,proxy:function(e,n){var r,i,o;return"string"==typeof n&&(o=e[n],n=e,e=o),b.isFunction(e)?(r=h.call(arguments,2),i=function(){return e.apply(n||this,r.concat(h.call(arguments)))},i.guid=e.guid=e.guid||b.guid++,i):t},access:function(e,n,r,i,o,a,s){var u=0,l=e.length,c=null==r;if("object"===b.type(r)){o=!0;for(u in r)b.access(e,n,u,r[u],!0,a,s)}else if(i!==t&&(o=!0,b.isFunction(i)||(s=!0),c&&(s?(n.call(e,i),n=null):(c=n,n=function(e,t,n){return c.call(b(e),n)})),n))for(;l>u;u++)n(e[u],r,s?i:i.call(e[u],u,n(e[u],r)));return o?e:c?n.call(e):l?n(e[0],r):a},now:function(){return(new Date).getTime()}}),b.ready.promise=function(t){if(!n)if(n=b.Deferred(),"complete"===o.readyState)setTimeout(b.ready);else if(o.addEventListener)o.addEventListener("DOMContentLoaded",H,!1),e.addEventListener("load",H,!1);else{o.attachEvent("onreadystatechange",H),e.attachEvent("onload",H);var r=!1;try{r=null==e.frameElement&&o.documentElement}catch(i){}r&&r.doScroll&&function a(){if(!b.isReady){try{r.doScroll("left")}catch(e){return setTimeout(a,50)}q(),b.ready()}}()}return n.promise(t)},b.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(e,t){l["[object "+t+"]"]=t.toLowerCase()});function M(e){var t=e.length,n=b.type(e);return b.isWindow(e)?!1:1===e.nodeType&&t?!0:"array"===n||"function"!==n&&(0===t||"number"==typeof t&&t>0&&t-1 in e)}r=b(o);var _={};function F(e){var t=_[e]={};return b.each(e.match(w)||[],function(e,n){t[n]=!0}),t}b.Callbacks=function(e){e="string"==typeof e?_[e]||F(e):b.extend({},e);var n,r,i,o,a,s,u=[],l=!e.once&&[],c=function(t){for(r=e.memory&&t,i=!0,a=s||0,s=0,o=u.length,n=!0;u&&o>a;a++)if(u[a].apply(t[0],t[1])===!1&&e.stopOnFalse){r=!1;break}n=!1,u&&(l?l.length&&c(l.shift()):r?u=[]:p.disable())},p={add:function(){if(u){var t=u.length;(function i(t){b.each(t,function(t,n){var r=b.type(n);"function"===r?e.unique&&p.has(n)||u.push(n):n&&n.length&&"string"!==r&&i(n)})})(arguments),n?o=u.length:r&&(s=t,c(r))}return this},remove:function(){return u&&b.each(arguments,function(e,t){var r;while((r=b.inArray(t,u,r))>-1)u.splice(r,1),n&&(o>=r&&o--,a>=r&&a--)}),this},has:function(e){return e?b.inArray(e,u)>-1:!(!u||!u.length)},empty:function(){return u=[],this},disable:function(){return u=l=r=t,this},disabled:function(){return!u},lock:function(){return l=t,r||p.disable(),this},locked:function(){return!l},fireWith:function(e,t){return t=t||[],t=[e,t.slice?t.slice():t],!u||i&&!l||(n?l.push(t):c(t)),this},fire:function(){return p.fireWith(this,arguments),this},fired:function(){return!!i}};return p},b.extend({Deferred:function(e){var t=[["resolve","done",b.Callbacks("once memory"),"resolved"],["reject","fail",b.Callbacks("once memory"),"rejected"],["notify","progress",b.Callbacks("memory")]],n="pending",r={state:function(){return n},always:function(){return i.done(arguments).fail(arguments),this},then:function(){var e=arguments;return b.Deferred(function(n){b.each(t,function(t,o){var a=o[0],s=b.isFunction(e[t])&&e[t];i[o[1]](function(){var e=s&&s.apply(this,arguments);e&&b.isFunction(e.promise)?e.promise().done(n.resolve).fail(n.reject).progress(n.notify):n[a+"With"](this===r?n.promise():this,s?[e]:arguments)})}),e=null}).promise()},promise:function(e){return null!=e?b.extend(e,r):r}},i={};return r.pipe=r.then,b.each(t,function(e,o){var a=o[2],s=o[3];r[o[1]]=a.add,s&&a.add(function(){n=s},t[1^e][2].disable,t[2][2].lock),i[o[0]]=function(){return i[o[0]+"With"](this===i?r:this,arguments),this},i[o[0]+"With"]=a.fireWith}),r.promise(i),e&&e.call(i,i),i},when:function(e){var t=0,n=h.call(arguments),r=n.length,i=1!==r||e&&b.isFunction(e.promise)?r:0,o=1===i?e:b.Deferred(),a=function(e,t,n){return function(r){t[e]=this,n[e]=arguments.length>1?h.call(arguments):r,n===s?o.notifyWith(t,n):--i||o.resolveWith(t,n)}},s,u,l;if(r>1)for(s=Array(r),u=Array(r),l=Array(r);r>t;t++)n[t]&&b.isFunction(n[t].promise)?n[t].promise().done(a(t,l,n)).fail(o.reject).progress(a(t,u,s)):--i;return i||o.resolveWith(l,n),o.promise()}}),b.support=function(){var t,n,r,a,s,u,l,c,p,f,d=o.createElement("div");if(d.setAttribute("className","t"),d.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",n=d.getElementsByTagName("*"),r=d.getElementsByTagName("a")[0],!n||!r||!n.length)return{};s=o.createElement("select"),l=s.appendChild(o.createElement("option")),a=d.getElementsByTagName("input")[0],r.style.cssText="top:1px;float:left;opacity:.5",t={getSetAttribute:"t"!==d.className,leadingWhitespace:3===d.firstChild.nodeType,tbody:!d.getElementsByTagName("tbody").length,htmlSerialize:!!d.getElementsByTagName("link").length,style:/top/.test(r.getAttribute("style")),hrefNormalized:"/a"===r.getAttribute("href"),opacity:/^0.5/.test(r.style.opacity),cssFloat:!!r.style.cssFloat,checkOn:!!a.value,optSelected:l.selected,enctype:!!o.createElement("form").enctype,html5Clone:"<:nav></:nav>"!==o.createElement("nav").cloneNode(!0).outerHTML,boxModel:"CSS1Compat"===o.compatMode,deleteExpando:!0,noCloneEvent:!0,inlineBlockNeedsLayout:!1,shrinkWrapBlocks:!1,reliableMarginRight:!0,boxSizingReliable:!0,pixelPosition:!1},a.checked=!0,t.noCloneChecked=a.cloneNode(!0).checked,s.disabled=!0,t.optDisabled=!l.disabled;try{delete d.test}catch(h){t.deleteExpando=!1}a=o.createElement("input"),a.setAttribute("value",""),t.input=""===a.getAttribute("value"),a.value="t",a.setAttribute("type","radio"),t.radioValue="t"===a.value,a.setAttribute("checked","t"),a.setAttribute("name","t"),u=o.createDocumentFragment(),u.appendChild(a),t.appendChecked=a.checked,t.checkClone=u.cloneNode(!0).cloneNode(!0).lastChild.checked,d.attachEvent&&(d.attachEvent("onclick",function(){t.noCloneEvent=!1}),d.cloneNode(!0).click());for(f in{submit:!0,change:!0,focusin:!0})d.setAttribute(c="on"+f,"t"),t[f+"Bubbles"]=c in e||d.attributes[c].expando===!1;return d.style.backgroundClip="content-box",d.cloneNode(!0).style.backgroundClip="",t.clearCloneStyle="content-box"===d.style.backgroundClip,b(function(){var n,r,a,s="padding:0;margin:0;border:0;display:block;box-sizing:content-box;-moz-box-sizing:content-box;-webkit-box-sizing:content-box;",u=o.getElementsByTagName("body")[0];u&&(n=o.createElement("div"),n.style.cssText="border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px",u.appendChild(n).appendChild(d),d.innerHTML="<table><tr><td></td><td>t</td></tr></table>",a=d.getElementsByTagName("td"),a[0].style.cssText="padding:0;margin:0;border:0;display:none",p=0===a[0].offsetHeight,a[0].style.display="",a[1].style.display="none",t.reliableHiddenOffsets=p&&0===a[0].offsetHeight,d.innerHTML="",d.style.cssText="box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;",t.boxSizing=4===d.offsetWidth,t.doesNotIncludeMarginInBodyOffset=1!==u.offsetTop,e.getComputedStyle&&(t.pixelPosition="1%"!==(e.getComputedStyle(d,null)||{}).top,t.boxSizingReliable="4px"===(e.getComputedStyle(d,null)||{width:"4px"}).width,r=d.appendChild(o.createElement("div")),r.style.cssText=d.style.cssText=s,r.style.marginRight=r.style.width="0",d.style.width="1px",t.reliableMarginRight=!parseFloat((e.getComputedStyle(r,null)||{}).marginRight)),typeof d.style.zoom!==i&&(d.innerHTML="",d.style.cssText=s+"width:1px;padding:1px;display:inline;zoom:1",t.inlineBlockNeedsLayout=3===d.offsetWidth,d.style.display="block",d.innerHTML="<div></div>",d.firstChild.style.width="5px",t.shrinkWrapBlocks=3!==d.offsetWidth,t.inlineBlockNeedsLayout&&(u.style.zoom=1)),u.removeChild(n),n=d=a=r=null)}),n=s=u=l=r=a=null,t}();var O=/(?:\{[\s\S]*\}|\[[\s\S]*\])$/,B=/([A-Z])/g;function P(e,n,r,i){if(b.acceptData(e)){var o,a,s=b.expando,u="string"==typeof n,l=e.nodeType,p=l?b.cache:e,f=l?e[s]:e[s]&&s;if(f&&p[f]&&(i||p[f].data)||!u||r!==t)return f||(l?e[s]=f=c.pop()||b.guid++:f=s),p[f]||(p[f]={},l||(p[f].toJSON=b.noop)),("object"==typeof n||"function"==typeof n)&&(i?p[f]=b.extend(p[f],n):p[f].data=b.extend(p[f].data,n)),o=p[f],i||(o.data||(o.data={}),o=o.data),r!==t&&(o[b.camelCase(n)]=r),u?(a=o[n],null==a&&(a=o[b.camelCase(n)])):a=o,a}}function R(e,t,n){if(b.acceptData(e)){var r,i,o,a=e.nodeType,s=a?b.cache:e,u=a?e[b.expando]:b.expando;if(s[u]){if(t&&(o=n?s[u]:s[u].data)){b.isArray(t)?t=t.concat(b.map(t,b.camelCase)):t in o?t=[t]:(t=b.camelCase(t),t=t in o?[t]:t.split(" "));for(r=0,i=t.length;i>r;r++)delete o[t[r]];if(!(n?$:b.isEmptyObject)(o))return}(n||(delete s[u].data,$(s[u])))&&(a?b.cleanData([e],!0):b.support.deleteExpando||s!=s.window?delete s[u]:s[u]=null)}}}b.extend({cache:{},expando:"jQuery"+(p+Math.random()).replace(/\D/g,""),noData:{embed:!0,object:"clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",applet:!0},hasData:function(e){return e=e.nodeType?b.cache[e[b.expando]]:e[b.expando],!!e&&!$(e)},data:function(e,t,n){return P(e,t,n)},removeData:function(e,t){return R(e,t)},_data:function(e,t,n){return P(e,t,n,!0)},_removeData:function(e,t){return R(e,t,!0)},acceptData:function(e){if(e.nodeType&&1!==e.nodeType&&9!==e.nodeType)return!1;var t=e.nodeName&&b.noData[e.nodeName.toLowerCase()];return!t||t!==!0&&e.getAttribute("classid")===t}}),b.fn.extend({data:function(e,n){var r,i,o=this[0],a=0,s=null;if(e===t){if(this.length&&(s=b.data(o),1===o.nodeType&&!b._data(o,"parsedAttrs"))){for(r=o.attributes;r.length>a;a++)i=r[a].name,i.indexOf("data-")||(i=b.camelCase(i.slice(5)),W(o,i,s[i]));b._data(o,"parsedAttrs",!0)}return s}return"object"==typeof e?this.each(function(){b.data(this,e)}):b.access(this,function(n){return n===t?o?W(o,e,b.data(o,e)):null:(this.each(function(){b.data(this,e,n)}),t)},null,n,arguments.length>1,null,!0)},removeData:function(e){return this.each(function(){b.removeData(this,e)})}});function W(e,n,r){if(r===t&&1===e.nodeType){var i="data-"+n.replace(B,"-$1").toLowerCase();if(r=e.getAttribute(i),"string"==typeof r){try{r="true"===r?!0:"false"===r?!1:"null"===r?null:+r+""===r?+r:O.test(r)?b.parseJSON(r):r}catch(o){}b.data(e,n,r)}else r=t}return r}function $(e){var t;for(t in e)if(("data"!==t||!b.isEmptyObject(e[t]))&&"toJSON"!==t)return!1;return!0}b.extend({queue:function(e,n,r){var i;return e?(n=(n||"fx")+"queue",i=b._data(e,n),r&&(!i||b.isArray(r)?i=b._data(e,n,b.makeArray(r)):i.push(r)),i||[]):t},dequeue:function(e,t){t=t||"fx";var n=b.queue(e,t),r=n.length,i=n.shift(),o=b._queueHooks(e,t),a=function(){b.dequeue(e,t)};"inprogress"===i&&(i=n.shift(),r--),o.cur=i,i&&("fx"===t&&n.unshift("inprogress"),delete o.stop,i.call(e,a,o)),!r&&o&&o.empty.fire()},_queueHooks:function(e,t){var n=t+"queueHooks";return b._data(e,n)||b._data(e,n,{empty:b.Callbacks("once memory").add(function(){b._removeData(e,t+"queue"),b._removeData(e,n)})})}}),b.fn.extend({queue:function(e,n){var r=2;return"string"!=typeof e&&(n=e,e="fx",r--),r>arguments.length?b.queue(this[0],e):n===t?this:this.each(function(){var t=b.queue(this,e,n);b._queueHooks(this,e),"fx"===e&&"inprogress"!==t[0]&&b.dequeue(this,e)})},dequeue:function(e){return this.each(function(){b.dequeue(this,e)})},delay:function(e,t){return e=b.fx?b.fx.speeds[e]||e:e,t=t||"fx",this.queue(t,function(t,n){var r=setTimeout(t,e);n.stop=function(){clearTimeout(r)}})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,n){var r,i=1,o=b.Deferred(),a=this,s=this.length,u=function(){--i||o.resolveWith(a,[a])};"string"!=typeof e&&(n=e,e=t),e=e||"fx";while(s--)r=b._data(a[s],e+"queueHooks"),r&&r.empty&&(i++,r.empty.add(u));return u(),o.promise(n)}});var I,z,X=/[\t\r\n]/g,U=/\r/g,V=/^(?:input|select|textarea|button|object)$/i,Y=/^(?:a|area)$/i,J=/^(?:checked|selected|autofocus|autoplay|async|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped)$/i,G=/^(?:checked|selected)$/i,Q=b.support.getSetAttribute,K=b.support.input;b.fn.extend({attr:function(e,t){return b.access(this,b.attr,e,t,arguments.length>1)},removeAttr:function(e){return this.each(function(){b.removeAttr(this,e)})},prop:function(e,t){return b.access(this,b.prop,e,t,arguments.length>1)},removeProp:function(e){return e=b.propFix[e]||e,this.each(function(){try{this[e]=t,delete this[e]}catch(n){}})},addClass:function(e){var t,n,r,i,o,a=0,s=this.length,u="string"==typeof e&&e;if(b.isFunction(e))return this.each(function(t){b(this).addClass(e.call(this,t,this.className))});if(u)for(t=(e||"").match(w)||[];s>a;a++)if(n=this[a],r=1===n.nodeType&&(n.className?(" "+n.className+" ").replace(X," "):" ")){o=0;while(i=t[o++])0>r.indexOf(" "+i+" ")&&(r+=i+" ");n.className=b.trim(r)}return this},removeClass:function(e){var t,n,r,i,o,a=0,s=this.length,u=0===arguments.length||"string"==typeof e&&e;if(b.isFunction(e))return this.each(function(t){b(this).removeClass(e.call(this,t,this.className))});if(u)for(t=(e||"").match(w)||[];s>a;a++)if(n=this[a],r=1===n.nodeType&&(n.className?(" "+n.className+" ").replace(X," "):"")){o=0;while(i=t[o++])while(r.indexOf(" "+i+" ")>=0)r=r.replace(" "+i+" "," ");n.className=e?b.trim(r):""}return this},toggleClass:function(e,t){var n=typeof e,r="boolean"==typeof t;return b.isFunction(e)?this.each(function(n){b(this).toggleClass(e.call(this,n,this.className,t),t)}):this.each(function(){if("string"===n){var o,a=0,s=b(this),u=t,l=e.match(w)||[];while(o=l[a++])u=r?u:!s.hasClass(o),s[u?"addClass":"removeClass"](o)}else(n===i||"boolean"===n)&&(this.className&&b._data(this,"__className__",this.className),this.className=this.className||e===!1?"":b._data(this,"__className__")||"")})},hasClass:function(e){var t=" "+e+" ",n=0,r=this.length;for(;r>n;n++)if(1===this[n].nodeType&&(" "+this[n].className+" ").replace(X," ").indexOf(t)>=0)return!0;return!1},val:function(e){var n,r,i,o=this[0];{if(arguments.length)return i=b.isFunction(e),this.each(function(n){var o,a=b(this);1===this.nodeType&&(o=i?e.call(this,n,a.val()):e,null==o?o="":"number"==typeof o?o+="":b.isArray(o)&&(o=b.map(o,function(e){return null==e?"":e+""})),r=b.valHooks[this.type]||b.valHooks[this.nodeName.toLowerCase()],r&&"set"in r&&r.set(this,o,"value")!==t||(this.value=o))});if(o)return r=b.valHooks[o.type]||b.valHooks[o.nodeName.toLowerCase()],r&&"get"in r&&(n=r.get(o,"value"))!==t?n:(n=o.value,"string"==typeof n?n.replace(U,""):null==n?"":n)}}}),b.extend({valHooks:{option:{get:function(e){var t=e.attributes.value;return!t||t.specified?e.value:e.text}},select:{get:function(e){var t,n,r=e.options,i=e.selectedIndex,o="select-one"===e.type||0>i,a=o?null:[],s=o?i+1:r.length,u=0>i?s:o?i:0;for(;s>u;u++)if(n=r[u],!(!n.selected&&u!==i||(b.support.optDisabled?n.disabled:null!==n.getAttribute("disabled"))||n.parentNode.disabled&&b.nodeName(n.parentNode,"optgroup"))){if(t=b(n).val(),o)return t;a.push(t)}return a},set:function(e,t){var n=b.makeArray(t);return b(e).find("option").each(function(){this.selected=b.inArray(b(this).val(),n)>=0}),n.length||(e.selectedIndex=-1),n}}},attr:function(e,n,r){var o,a,s,u=e.nodeType;if(e&&3!==u&&8!==u&&2!==u)return typeof e.getAttribute===i?b.prop(e,n,r):(a=1!==u||!b.isXMLDoc(e),a&&(n=n.toLowerCase(),o=b.attrHooks[n]||(J.test(n)?z:I)),r===t?o&&a&&"get"in o&&null!==(s=o.get(e,n))?s:(typeof e.getAttribute!==i&&(s=e.getAttribute(n)),null==s?t:s):null!==r?o&&a&&"set"in o&&(s=o.set(e,r,n))!==t?s:(e.setAttribute(n,r+""),r):(b.removeAttr(e,n),t))},removeAttr:function(e,t){var n,r,i=0,o=t&&t.match(w);if(o&&1===e.nodeType)while(n=o[i++])r=b.propFix[n]||n,J.test(n)?!Q&&G.test(n)?e[b.camelCase("default-"+n)]=e[r]=!1:e[r]=!1:b.attr(e,n,""),e.removeAttribute(Q?n:r)},attrHooks:{type:{set:function(e,t){if(!b.support.radioValue&&"radio"===t&&b.nodeName(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}},propFix:{tabindex:"tabIndex",readonly:"readOnly","for":"htmlFor","class":"className",maxlength:"maxLength",cellspacing:"cellSpacing",cellpadding:"cellPadding",rowspan:"rowSpan",colspan:"colSpan",usemap:"useMap",frameborder:"frameBorder",contenteditable:"contentEditable"},prop:function(e,n,r){var i,o,a,s=e.nodeType;if(e&&3!==s&&8!==s&&2!==s)return a=1!==s||!b.isXMLDoc(e),a&&(n=b.propFix[n]||n,o=b.propHooks[n]),r!==t?o&&"set"in o&&(i=o.set(e,r,n))!==t?i:e[n]=r:o&&"get"in o&&null!==(i=o.get(e,n))?i:e[n]},propHooks:{tabIndex:{get:function(e){var n=e.getAttributeNode("tabindex");return n&&n.specified?parseInt(n.value,10):V.test(e.nodeName)||Y.test(e.nodeName)&&e.href?0:t}}}}),z={get:function(e,n){var r=b.prop(e,n),i="boolean"==typeof r&&e.getAttribute(n),o="boolean"==typeof r?K&&Q?null!=i:G.test(n)?e[b.camelCase("default-"+n)]:!!i:e.getAttributeNode(n);return o&&o.value!==!1?n.toLowerCase():t},set:function(e,t,n){return t===!1?b.removeAttr(e,n):K&&Q||!G.test(n)?e.setAttribute(!Q&&b.propFix[n]||n,n):e[b.camelCase("default-"+n)]=e[n]=!0,n}},K&&Q||(b.attrHooks.value={get:function(e,n){var r=e.getAttributeNode(n);return b.nodeName(e,"input")?e.defaultValue:r&&r.specified?r.value:t},set:function(e,n,r){return b.nodeName(e,"input")?(e.defaultValue=n,t):I&&I.set(e,n,r)}}),Q||(I=b.valHooks.button={get:function(e,n){var r=e.getAttributeNode(n);return r&&("id"===n||"name"===n||"coords"===n?""!==r.value:r.specified)?r.value:t},set:function(e,n,r){var i=e.getAttributeNode(r);return i||e.setAttributeNode(i=e.ownerDocument.createAttribute(r)),i.value=n+="","value"===r||n===e.getAttribute(r)?n:t}},b.attrHooks.contenteditable={get:I.get,set:function(e,t,n){I.set(e,""===t?!1:t,n)}},b.each(["width","height"],function(e,n){b.attrHooks[n]=b.extend(b.attrHooks[n],{set:function(e,r){return""===r?(e.setAttribute(n,"auto"),r):t}})})),b.support.hrefNormalized||(b.each(["href","src","width","height"],function(e,n){b.attrHooks[n]=b.extend(b.attrHooks[n],{get:function(e){var r=e.getAttribute(n,2);return null==r?t:r}})}),b.each(["href","src"],function(e,t){b.propHooks[t]={get:function(e){return e.getAttribute(t,4)}}})),b.support.style||(b.attrHooks.style={get:function(e){return e.style.cssText||t},set:function(e,t){return e.style.cssText=t+""}}),b.support.optSelected||(b.propHooks.selected=b.extend(b.propHooks.selected,{get:function(e){var t=e.parentNode;return t&&(t.selectedIndex,t.parentNode&&t.parentNode.selectedIndex),null}})),b.support.enctype||(b.propFix.enctype="encoding"),b.support.checkOn||b.each(["radio","checkbox"],function(){b.valHooks[this]={get:function(e){return null===e.getAttribute("value")?"on":e.value}}}),b.each(["radio","checkbox"],function(){b.valHooks[this]=b.extend(b.valHooks[this],{set:function(e,n){return b.isArray(n)?e.checked=b.inArray(b(e).val(),n)>=0:t}})});var Z=/^(?:input|select|textarea)$/i,et=/^key/,tt=/^(?:mouse|contextmenu)|click/,nt=/^(?:focusinfocus|focusoutblur)$/,rt=/^([^.]*)(?:\.(.+)|)$/;function it(){return!0}function ot(){return!1}b.event={global:{},add:function(e,n,r,o,a){var s,u,l,c,p,f,d,h,g,m,y,v=b._data(e);if(v){r.handler&&(c=r,r=c.handler,a=c.selector),r.guid||(r.guid=b.guid++),(u=v.events)||(u=v.events={}),(f=v.handle)||(f=v.handle=function(e){return typeof b===i||e&&b.event.triggered===e.type?t:b.event.dispatch.apply(f.elem,arguments)},f.elem=e),n=(n||"").match(w)||[""],l=n.length;while(l--)s=rt.exec(n[l])||[],g=y=s[1],m=(s[2]||"").split(".").sort(),p=b.event.special[g]||{},g=(a?p.delegateType:p.bindType)||g,p=b.event.special[g]||{},d=b.extend({type:g,origType:y,data:o,handler:r,guid:r.guid,selector:a,needsContext:a&&b.expr.match.needsContext.test(a),namespace:m.join(".")},c),(h=u[g])||(h=u[g]=[],h.delegateCount=0,p.setup&&p.setup.call(e,o,m,f)!==!1||(e.addEventListener?e.addEventListener(g,f,!1):e.attachEvent&&e.attachEvent("on"+g,f))),p.add&&(p.add.call(e,d),d.handler.guid||(d.handler.guid=r.guid)),a?h.splice(h.delegateCount++,0,d):h.push(d),b.event.global[g]=!0;e=null}},remove:function(e,t,n,r,i){var o,a,s,u,l,c,p,f,d,h,g,m=b.hasData(e)&&b._data(e);if(m&&(c=m.events)){t=(t||"").match(w)||[""],l=t.length;while(l--)if(s=rt.exec(t[l])||[],d=g=s[1],h=(s[2]||"").split(".").sort(),d){p=b.event.special[d]||{},d=(r?p.delegateType:p.bindType)||d,f=c[d]||[],s=s[2]&&RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"),u=o=f.length;while(o--)a=f[o],!i&&g!==a.origType||n&&n.guid!==a.guid||s&&!s.test(a.namespace)||r&&r!==a.selector&&("**"!==r||!a.selector)||(f.splice(o,1),a.selector&&f.delegateCount--,p.remove&&p.remove.call(e,a));u&&!f.length&&(p.teardown&&p.teardown.call(e,h,m.handle)!==!1||b.removeEvent(e,d,m.handle),delete c[d])}else for(d in c)b.event.remove(e,d+t[l],n,r,!0);b.isEmptyObject(c)&&(delete m.handle,b._removeData(e,"events"))}},trigger:function(n,r,i,a){var s,u,l,c,p,f,d,h=[i||o],g=y.call(n,"type")?n.type:n,m=y.call(n,"namespace")?n.namespace.split("."):[];if(l=f=i=i||o,3!==i.nodeType&&8!==i.nodeType&&!nt.test(g+b.event.triggered)&&(g.indexOf(".")>=0&&(m=g.split("."),g=m.shift(),m.sort()),u=0>g.indexOf(":")&&"on"+g,n=n[b.expando]?n:new b.Event(g,"object"==typeof n&&n),n.isTrigger=!0,n.namespace=m.join("."),n.namespace_re=n.namespace?RegExp("(^|\\.)"+m.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,n.result=t,n.target||(n.target=i),r=null==r?[n]:b.makeArray(r,[n]),p=b.event.special[g]||{},a||!p.trigger||p.trigger.apply(i,r)!==!1)){if(!a&&!p.noBubble&&!b.isWindow(i)){for(c=p.delegateType||g,nt.test(c+g)||(l=l.parentNode);l;l=l.parentNode)h.push(l),f=l;f===(i.ownerDocument||o)&&h.push(f.defaultView||f.parentWindow||e)}d=0;while((l=h[d++])&&!n.isPropagationStopped())n.type=d>1?c:p.bindType||g,s=(b._data(l,"events")||{})[n.type]&&b._data(l,"handle"),s&&s.apply(l,r),s=u&&l[u],s&&b.acceptData(l)&&s.apply&&s.apply(l,r)===!1&&n.preventDefault();if(n.type=g,!(a||n.isDefaultPrevented()||p._default&&p._default.apply(i.ownerDocument,r)!==!1||"click"===g&&b.nodeName(i,"a")||!b.acceptData(i)||!u||!i[g]||b.isWindow(i))){f=i[u],f&&(i[u]=null),b.event.triggered=g;try{i[g]()}catch(v){}b.event.triggered=t,f&&(i[u]=f)}return n.result}},dispatch:function(e){e=b.event.fix(e);var n,r,i,o,a,s=[],u=h.call(arguments),l=(b._data(this,"events")||{})[e.type]||[],c=b.event.special[e.type]||{};if(u[0]=e,e.delegateTarget=this,!c.preDispatch||c.preDispatch.call(this,e)!==!1){s=b.event.handlers.call(this,e,l),n=0;while((o=s[n++])&&!e.isPropagationStopped()){e.currentTarget=o.elem,a=0;while((i=o.handlers[a++])&&!e.isImmediatePropagationStopped())(!e.namespace_re||e.namespace_re.test(i.namespace))&&(e.handleObj=i,e.data=i.data,r=((b.event.special[i.origType]||{}).handle||i.handler).apply(o.elem,u),r!==t&&(e.result=r)===!1&&(e.preventDefault(),e.stopPropagation()))}return c.postDispatch&&c.postDispatch.call(this,e),e.result}},handlers:function(e,n){var r,i,o,a,s=[],u=n.delegateCount,l=e.target;if(u&&l.nodeType&&(!e.button||"click"!==e.type))for(;l!=this;l=l.parentNode||this)if(1===l.nodeType&&(l.disabled!==!0||"click"!==e.type)){for(o=[],a=0;u>a;a++)i=n[a],r=i.selector+" ",o[r]===t&&(o[r]=i.needsContext?b(r,this).index(l)>=0:b.find(r,this,null,[l]).length),o[r]&&o.push(i);o.length&&s.push({elem:l,handlers:o})}return n.length>u&&s.push({elem:this,handlers:n.slice(u)}),s},fix:function(e){if(e[b.expando])return e;var t,n,r,i=e.type,a=e,s=this.fixHooks[i];s||(this.fixHooks[i]=s=tt.test(i)?this.mouseHooks:et.test(i)?this.keyHooks:{}),r=s.props?this.props.concat(s.props):this.props,e=new b.Event(a),t=r.length;while(t--)n=r[t],e[n]=a[n];return e.target||(e.target=a.srcElement||o),3===e.target.nodeType&&(e.target=e.target.parentNode),e.metaKey=!!e.metaKey,s.filter?s.filter(e,a):e},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(e,t){return null==e.which&&(e.which=null!=t.charCode?t.charCode:t.keyCode),e}},mouseHooks:{props:"button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(e,n){var r,i,a,s=n.button,u=n.fromElement;return null==e.pageX&&null!=n.clientX&&(i=e.target.ownerDocument||o,a=i.documentElement,r=i.body,e.pageX=n.clientX+(a&&a.scrollLeft||r&&r.scrollLeft||0)-(a&&a.clientLeft||r&&r.clientLeft||0),e.pageY=n.clientY+(a&&a.scrollTop||r&&r.scrollTop||0)-(a&&a.clientTop||r&&r.clientTop||0)),!e.relatedTarget&&u&&(e.relatedTarget=u===e.target?n.toElement:u),e.which||s===t||(e.which=1&s?1:2&s?3:4&s?2:0),e}},special:{load:{noBubble:!0},click:{trigger:function(){return b.nodeName(this,"input")&&"checkbox"===this.type&&this.click?(this.click(),!1):t}},focus:{trigger:function(){if(this!==o.activeElement&&this.focus)try{return this.focus(),!1}catch(e){}},delegateType:"focusin"},blur:{trigger:function(){return this===o.activeElement&&this.blur?(this.blur(),!1):t},delegateType:"focusout"},beforeunload:{postDispatch:function(e){e.result!==t&&(e.originalEvent.returnValue=e.result)}}},simulate:function(e,t,n,r){var i=b.extend(new b.Event,n,{type:e,isSimulated:!0,originalEvent:{}});r?b.event.trigger(i,null,t):b.event.dispatch.call(t,i),i.isDefaultPrevented()&&n.preventDefault()}},b.removeEvent=o.removeEventListener?function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n,!1)}:function(e,t,n){var r="on"+t;e.detachEvent&&(typeof e[r]===i&&(e[r]=null),e.detachEvent(r,n))},b.Event=function(e,n){return this instanceof b.Event?(e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||e.returnValue===!1||e.getPreventDefault&&e.getPreventDefault()?it:ot):this.type=e,n&&b.extend(this,n),this.timeStamp=e&&e.timeStamp||b.now(),this[b.expando]=!0,t):new b.Event(e,n)},b.Event.prototype={isDefaultPrevented:ot,isPropagationStopped:ot,isImmediatePropagationStopped:ot,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=it,e&&(e.preventDefault?e.preventDefault():e.returnValue=!1)},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=it,e&&(e.stopPropagation&&e.stopPropagation(),e.cancelBubble=!0)},stopImmediatePropagation:function(){this.isImmediatePropagationStopped=it,this.stopPropagation()}},b.each({mouseenter:"mouseover",mouseleave:"mouseout"},function(e,t){b.event.special[e]={delegateType:t,bindType:t,handle:function(e){var n,r=this,i=e.relatedTarget,o=e.handleObj;
return(!i||i!==r&&!b.contains(r,i))&&(e.type=o.origType,n=o.handler.apply(this,arguments),e.type=t),n}}}),b.support.submitBubbles||(b.event.special.submit={setup:function(){return b.nodeName(this,"form")?!1:(b.event.add(this,"click._submit keypress._submit",function(e){var n=e.target,r=b.nodeName(n,"input")||b.nodeName(n,"button")?n.form:t;r&&!b._data(r,"submitBubbles")&&(b.event.add(r,"submit._submit",function(e){e._submit_bubble=!0}),b._data(r,"submitBubbles",!0))}),t)},postDispatch:function(e){e._submit_bubble&&(delete e._submit_bubble,this.parentNode&&!e.isTrigger&&b.event.simulate("submit",this.parentNode,e,!0))},teardown:function(){return b.nodeName(this,"form")?!1:(b.event.remove(this,"._submit"),t)}}),b.support.changeBubbles||(b.event.special.change={setup:function(){return Z.test(this.nodeName)?(("checkbox"===this.type||"radio"===this.type)&&(b.event.add(this,"propertychange._change",function(e){"checked"===e.originalEvent.propertyName&&(this._just_changed=!0)}),b.event.add(this,"click._change",function(e){this._just_changed&&!e.isTrigger&&(this._just_changed=!1),b.event.simulate("change",this,e,!0)})),!1):(b.event.add(this,"beforeactivate._change",function(e){var t=e.target;Z.test(t.nodeName)&&!b._data(t,"changeBubbles")&&(b.event.add(t,"change._change",function(e){!this.parentNode||e.isSimulated||e.isTrigger||b.event.simulate("change",this.parentNode,e,!0)}),b._data(t,"changeBubbles",!0))}),t)},handle:function(e){var n=e.target;return this!==n||e.isSimulated||e.isTrigger||"radio"!==n.type&&"checkbox"!==n.type?e.handleObj.handler.apply(this,arguments):t},teardown:function(){return b.event.remove(this,"._change"),!Z.test(this.nodeName)}}),b.support.focusinBubbles||b.each({focus:"focusin",blur:"focusout"},function(e,t){var n=0,r=function(e){b.event.simulate(t,e.target,b.event.fix(e),!0)};b.event.special[t]={setup:function(){0===n++&&o.addEventListener(e,r,!0)},teardown:function(){0===--n&&o.removeEventListener(e,r,!0)}}}),b.fn.extend({on:function(e,n,r,i,o){var a,s;if("object"==typeof e){"string"!=typeof n&&(r=r||n,n=t);for(a in e)this.on(a,n,r,e[a],o);return this}if(null==r&&null==i?(i=n,r=n=t):null==i&&("string"==typeof n?(i=r,r=t):(i=r,r=n,n=t)),i===!1)i=ot;else if(!i)return this;return 1===o&&(s=i,i=function(e){return b().off(e),s.apply(this,arguments)},i.guid=s.guid||(s.guid=b.guid++)),this.each(function(){b.event.add(this,e,i,r,n)})},one:function(e,t,n,r){return this.on(e,t,n,r,1)},off:function(e,n,r){var i,o;if(e&&e.preventDefault&&e.handleObj)return i=e.handleObj,b(e.delegateTarget).off(i.namespace?i.origType+"."+i.namespace:i.origType,i.selector,i.handler),this;if("object"==typeof e){for(o in e)this.off(o,n,e[o]);return this}return(n===!1||"function"==typeof n)&&(r=n,n=t),r===!1&&(r=ot),this.each(function(){b.event.remove(this,e,r,n)})},bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return 1===arguments.length?this.off(e,"**"):this.off(t,e||"**",n)},trigger:function(e,t){return this.each(function(){b.event.trigger(e,t,this)})},triggerHandler:function(e,n){var r=this[0];return r?b.event.trigger(e,n,r,!0):t}}),function(e,t){var n,r,i,o,a,s,u,l,c,p,f,d,h,g,m,y,v,x="sizzle"+-new Date,w=e.document,T={},N=0,C=0,k=it(),E=it(),S=it(),A=typeof t,j=1<<31,D=[],L=D.pop,H=D.push,q=D.slice,M=D.indexOf||function(e){var t=0,n=this.length;for(;n>t;t++)if(this[t]===e)return t;return-1},_="[\\x20\\t\\r\\n\\f]",F="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",O=F.replace("w","w#"),B="([*^$|!~]?=)",P="\\["+_+"*("+F+")"+_+"*(?:"+B+_+"*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|("+O+")|)|)"+_+"*\\]",R=":("+F+")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|"+P.replace(3,8)+")*)|.*)\\)|)",W=RegExp("^"+_+"+|((?:^|[^\\\\])(?:\\\\.)*)"+_+"+$","g"),$=RegExp("^"+_+"*,"+_+"*"),I=RegExp("^"+_+"*([\\x20\\t\\r\\n\\f>+~])"+_+"*"),z=RegExp(R),X=RegExp("^"+O+"$"),U={ID:RegExp("^#("+F+")"),CLASS:RegExp("^\\.("+F+")"),NAME:RegExp("^\\[name=['\"]?("+F+")['\"]?\\]"),TAG:RegExp("^("+F.replace("w","w*")+")"),ATTR:RegExp("^"+P),PSEUDO:RegExp("^"+R),CHILD:RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+_+"*(even|odd|(([+-]|)(\\d*)n|)"+_+"*(?:([+-]|)"+_+"*(\\d+)|))"+_+"*\\)|)","i"),needsContext:RegExp("^"+_+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+_+"*((?:-\\d)?\\d*)"+_+"*\\)|)(?=[^-]|$)","i")},V=/[\x20\t\r\n\f]*[+~]/,Y=/^[^{]+\{\s*\[native code/,J=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,G=/^(?:input|select|textarea|button)$/i,Q=/^h\d$/i,K=/'|\\/g,Z=/\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,et=/\\([\da-fA-F]{1,6}[\x20\t\r\n\f]?|.)/g,tt=function(e,t){var n="0x"+t-65536;return n!==n?t:0>n?String.fromCharCode(n+65536):String.fromCharCode(55296|n>>10,56320|1023&n)};try{q.call(w.documentElement.childNodes,0)[0].nodeType}catch(nt){q=function(e){var t,n=[];while(t=this[e++])n.push(t);return n}}function rt(e){return Y.test(e+"")}function it(){var e,t=[];return e=function(n,r){return t.push(n+=" ")>i.cacheLength&&delete e[t.shift()],e[n]=r}}function ot(e){return e[x]=!0,e}function at(e){var t=p.createElement("div");try{return e(t)}catch(n){return!1}finally{t=null}}function st(e,t,n,r){var i,o,a,s,u,l,f,g,m,v;if((t?t.ownerDocument||t:w)!==p&&c(t),t=t||p,n=n||[],!e||"string"!=typeof e)return n;if(1!==(s=t.nodeType)&&9!==s)return[];if(!d&&!r){if(i=J.exec(e))if(a=i[1]){if(9===s){if(o=t.getElementById(a),!o||!o.parentNode)return n;if(o.id===a)return n.push(o),n}else if(t.ownerDocument&&(o=t.ownerDocument.getElementById(a))&&y(t,o)&&o.id===a)return n.push(o),n}else{if(i[2])return H.apply(n,q.call(t.getElementsByTagName(e),0)),n;if((a=i[3])&&T.getByClassName&&t.getElementsByClassName)return H.apply(n,q.call(t.getElementsByClassName(a),0)),n}if(T.qsa&&!h.test(e)){if(f=!0,g=x,m=t,v=9===s&&e,1===s&&"object"!==t.nodeName.toLowerCase()){l=ft(e),(f=t.getAttribute("id"))?g=f.replace(K,"\\$&"):t.setAttribute("id",g),g="[id='"+g+"'] ",u=l.length;while(u--)l[u]=g+dt(l[u]);m=V.test(e)&&t.parentNode||t,v=l.join(",")}if(v)try{return H.apply(n,q.call(m.querySelectorAll(v),0)),n}catch(b){}finally{f||t.removeAttribute("id")}}}return wt(e.replace(W,"$1"),t,n,r)}a=st.isXML=function(e){var t=e&&(e.ownerDocument||e).documentElement;return t?"HTML"!==t.nodeName:!1},c=st.setDocument=function(e){var n=e?e.ownerDocument||e:w;return n!==p&&9===n.nodeType&&n.documentElement?(p=n,f=n.documentElement,d=a(n),T.tagNameNoComments=at(function(e){return e.appendChild(n.createComment("")),!e.getElementsByTagName("*").length}),T.attributes=at(function(e){e.innerHTML="<select></select>";var t=typeof e.lastChild.getAttribute("multiple");return"boolean"!==t&&"string"!==t}),T.getByClassName=at(function(e){return e.innerHTML="<div class='hidden e'></div><div class='hidden'></div>",e.getElementsByClassName&&e.getElementsByClassName("e").length?(e.lastChild.className="e",2===e.getElementsByClassName("e").length):!1}),T.getByName=at(function(e){e.id=x+0,e.innerHTML="<a name='"+x+"'></a><div name='"+x+"'></div>",f.insertBefore(e,f.firstChild);var t=n.getElementsByName&&n.getElementsByName(x).length===2+n.getElementsByName(x+0).length;return T.getIdNotName=!n.getElementById(x),f.removeChild(e),t}),i.attrHandle=at(function(e){return e.innerHTML="<a href='#'></a>",e.firstChild&&typeof e.firstChild.getAttribute!==A&&"#"===e.firstChild.getAttribute("href")})?{}:{href:function(e){return e.getAttribute("href",2)},type:function(e){return e.getAttribute("type")}},T.getIdNotName?(i.find.ID=function(e,t){if(typeof t.getElementById!==A&&!d){var n=t.getElementById(e);return n&&n.parentNode?[n]:[]}},i.filter.ID=function(e){var t=e.replace(et,tt);return function(e){return e.getAttribute("id")===t}}):(i.find.ID=function(e,n){if(typeof n.getElementById!==A&&!d){var r=n.getElementById(e);return r?r.id===e||typeof r.getAttributeNode!==A&&r.getAttributeNode("id").value===e?[r]:t:[]}},i.filter.ID=function(e){var t=e.replace(et,tt);return function(e){var n=typeof e.getAttributeNode!==A&&e.getAttributeNode("id");return n&&n.value===t}}),i.find.TAG=T.tagNameNoComments?function(e,n){return typeof n.getElementsByTagName!==A?n.getElementsByTagName(e):t}:function(e,t){var n,r=[],i=0,o=t.getElementsByTagName(e);if("*"===e){while(n=o[i++])1===n.nodeType&&r.push(n);return r}return o},i.find.NAME=T.getByName&&function(e,n){return typeof n.getElementsByName!==A?n.getElementsByName(name):t},i.find.CLASS=T.getByClassName&&function(e,n){return typeof n.getElementsByClassName===A||d?t:n.getElementsByClassName(e)},g=[],h=[":focus"],(T.qsa=rt(n.querySelectorAll))&&(at(function(e){e.innerHTML="<select><option selected=''></option></select>",e.querySelectorAll("[selected]").length||h.push("\\["+_+"*(?:checked|disabled|ismap|multiple|readonly|selected|value)"),e.querySelectorAll(":checked").length||h.push(":checked")}),at(function(e){e.innerHTML="<input type='hidden' i=''/>",e.querySelectorAll("[i^='']").length&&h.push("[*^$]="+_+"*(?:\"\"|'')"),e.querySelectorAll(":enabled").length||h.push(":enabled",":disabled"),e.querySelectorAll("*,:x"),h.push(",.*:")})),(T.matchesSelector=rt(m=f.matchesSelector||f.mozMatchesSelector||f.webkitMatchesSelector||f.oMatchesSelector||f.msMatchesSelector))&&at(function(e){T.disconnectedMatch=m.call(e,"div"),m.call(e,"[s!='']:x"),g.push("!=",R)}),h=RegExp(h.join("|")),g=RegExp(g.join("|")),y=rt(f.contains)||f.compareDocumentPosition?function(e,t){var n=9===e.nodeType?e.documentElement:e,r=t&&t.parentNode;return e===r||!(!r||1!==r.nodeType||!(n.contains?n.contains(r):e.compareDocumentPosition&&16&e.compareDocumentPosition(r)))}:function(e,t){if(t)while(t=t.parentNode)if(t===e)return!0;return!1},v=f.compareDocumentPosition?function(e,t){var r;return e===t?(u=!0,0):(r=t.compareDocumentPosition&&e.compareDocumentPosition&&e.compareDocumentPosition(t))?1&r||e.parentNode&&11===e.parentNode.nodeType?e===n||y(w,e)?-1:t===n||y(w,t)?1:0:4&r?-1:1:e.compareDocumentPosition?-1:1}:function(e,t){var r,i=0,o=e.parentNode,a=t.parentNode,s=[e],l=[t];if(e===t)return u=!0,0;if(!o||!a)return e===n?-1:t===n?1:o?-1:a?1:0;if(o===a)return ut(e,t);r=e;while(r=r.parentNode)s.unshift(r);r=t;while(r=r.parentNode)l.unshift(r);while(s[i]===l[i])i++;return i?ut(s[i],l[i]):s[i]===w?-1:l[i]===w?1:0},u=!1,[0,0].sort(v),T.detectDuplicates=u,p):p},st.matches=function(e,t){return st(e,null,null,t)},st.matchesSelector=function(e,t){if((e.ownerDocument||e)!==p&&c(e),t=t.replace(Z,"='$1']"),!(!T.matchesSelector||d||g&&g.test(t)||h.test(t)))try{var n=m.call(e,t);if(n||T.disconnectedMatch||e.document&&11!==e.document.nodeType)return n}catch(r){}return st(t,p,null,[e]).length>0},st.contains=function(e,t){return(e.ownerDocument||e)!==p&&c(e),y(e,t)},st.attr=function(e,t){var n;return(e.ownerDocument||e)!==p&&c(e),d||(t=t.toLowerCase()),(n=i.attrHandle[t])?n(e):d||T.attributes?e.getAttribute(t):((n=e.getAttributeNode(t))||e.getAttribute(t))&&e[t]===!0?t:n&&n.specified?n.value:null},st.error=function(e){throw Error("Syntax error, unrecognized expression: "+e)},st.uniqueSort=function(e){var t,n=[],r=1,i=0;if(u=!T.detectDuplicates,e.sort(v),u){for(;t=e[r];r++)t===e[r-1]&&(i=n.push(r));while(i--)e.splice(n[i],1)}return e};function ut(e,t){var n=t&&e,r=n&&(~t.sourceIndex||j)-(~e.sourceIndex||j);if(r)return r;if(n)while(n=n.nextSibling)if(n===t)return-1;return e?1:-1}function lt(e){return function(t){var n=t.nodeName.toLowerCase();return"input"===n&&t.type===e}}function ct(e){return function(t){var n=t.nodeName.toLowerCase();return("input"===n||"button"===n)&&t.type===e}}function pt(e){return ot(function(t){return t=+t,ot(function(n,r){var i,o=e([],n.length,t),a=o.length;while(a--)n[i=o[a]]&&(n[i]=!(r[i]=n[i]))})})}o=st.getText=function(e){var t,n="",r=0,i=e.nodeType;if(i){if(1===i||9===i||11===i){if("string"==typeof e.textContent)return e.textContent;for(e=e.firstChild;e;e=e.nextSibling)n+=o(e)}else if(3===i||4===i)return e.nodeValue}else for(;t=e[r];r++)n+=o(t);return n},i=st.selectors={cacheLength:50,createPseudo:ot,match:U,find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(et,tt),e[3]=(e[4]||e[5]||"").replace(et,tt),"~="===e[2]&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),"nth"===e[1].slice(0,3)?(e[3]||st.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*("even"===e[3]||"odd"===e[3])),e[5]=+(e[7]+e[8]||"odd"===e[3])):e[3]&&st.error(e[0]),e},PSEUDO:function(e){var t,n=!e[5]&&e[2];return U.CHILD.test(e[0])?null:(e[4]?e[2]=e[4]:n&&z.test(n)&&(t=ft(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){return"*"===e?function(){return!0}:(e=e.replace(et,tt).toLowerCase(),function(t){return t.nodeName&&t.nodeName.toLowerCase()===e})},CLASS:function(e){var t=k[e+" "];return t||(t=RegExp("(^|"+_+")"+e+"("+_+"|$)"))&&k(e,function(e){return t.test(e.className||typeof e.getAttribute!==A&&e.getAttribute("class")||"")})},ATTR:function(e,t,n){return function(r){var i=st.attr(r,e);return null==i?"!="===t:t?(i+="","="===t?i===n:"!="===t?i!==n:"^="===t?n&&0===i.indexOf(n):"*="===t?n&&i.indexOf(n)>-1:"$="===t?n&&i.slice(-n.length)===n:"~="===t?(" "+i+" ").indexOf(n)>-1:"|="===t?i===n||i.slice(0,n.length+1)===n+"-":!1):!0}},CHILD:function(e,t,n,r,i){var o="nth"!==e.slice(0,3),a="last"!==e.slice(-4),s="of-type"===t;return 1===r&&0===i?function(e){return!!e.parentNode}:function(t,n,u){var l,c,p,f,d,h,g=o!==a?"nextSibling":"previousSibling",m=t.parentNode,y=s&&t.nodeName.toLowerCase(),v=!u&&!s;if(m){if(o){while(g){p=t;while(p=p[g])if(s?p.nodeName.toLowerCase()===y:1===p.nodeType)return!1;h=g="only"===e&&!h&&"nextSibling"}return!0}if(h=[a?m.firstChild:m.lastChild],a&&v){c=m[x]||(m[x]={}),l=c[e]||[],d=l[0]===N&&l[1],f=l[0]===N&&l[2],p=d&&m.childNodes[d];while(p=++d&&p&&p[g]||(f=d=0)||h.pop())if(1===p.nodeType&&++f&&p===t){c[e]=[N,d,f];break}}else if(v&&(l=(t[x]||(t[x]={}))[e])&&l[0]===N)f=l[1];else while(p=++d&&p&&p[g]||(f=d=0)||h.pop())if((s?p.nodeName.toLowerCase()===y:1===p.nodeType)&&++f&&(v&&((p[x]||(p[x]={}))[e]=[N,f]),p===t))break;return f-=i,f===r||0===f%r&&f/r>=0}}},PSEUDO:function(e,t){var n,r=i.pseudos[e]||i.setFilters[e.toLowerCase()]||st.error("unsupported pseudo: "+e);return r[x]?r(t):r.length>1?(n=[e,e,"",t],i.setFilters.hasOwnProperty(e.toLowerCase())?ot(function(e,n){var i,o=r(e,t),a=o.length;while(a--)i=M.call(e,o[a]),e[i]=!(n[i]=o[a])}):function(e){return r(e,0,n)}):r}},pseudos:{not:ot(function(e){var t=[],n=[],r=s(e.replace(W,"$1"));return r[x]?ot(function(e,t,n,i){var o,a=r(e,null,i,[]),s=e.length;while(s--)(o=a[s])&&(e[s]=!(t[s]=o))}):function(e,i,o){return t[0]=e,r(t,null,o,n),!n.pop()}}),has:ot(function(e){return function(t){return st(e,t).length>0}}),contains:ot(function(e){return function(t){return(t.textContent||t.innerText||o(t)).indexOf(e)>-1}}),lang:ot(function(e){return X.test(e||"")||st.error("unsupported lang: "+e),e=e.replace(et,tt).toLowerCase(),function(t){var n;do if(n=d?t.getAttribute("xml:lang")||t.getAttribute("lang"):t.lang)return n=n.toLowerCase(),n===e||0===n.indexOf(e+"-");while((t=t.parentNode)&&1===t.nodeType);return!1}}),target:function(t){var n=e.location&&e.location.hash;return n&&n.slice(1)===t.id},root:function(e){return e===f},focus:function(e){return e===p.activeElement&&(!p.hasFocus||p.hasFocus())&&!!(e.type||e.href||~e.tabIndex)},enabled:function(e){return e.disabled===!1},disabled:function(e){return e.disabled===!0},checked:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&!!e.checked||"option"===t&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,e.selected===!0},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeName>"@"||3===e.nodeType||4===e.nodeType)return!1;return!0},parent:function(e){return!i.pseudos.empty(e)},header:function(e){return Q.test(e.nodeName)},input:function(e){return G.test(e.nodeName)},button:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&"button"===e.type||"button"===t},text:function(e){var t;return"input"===e.nodeName.toLowerCase()&&"text"===e.type&&(null==(t=e.getAttribute("type"))||t.toLowerCase()===e.type)},first:pt(function(){return[0]}),last:pt(function(e,t){return[t-1]}),eq:pt(function(e,t,n){return[0>n?n+t:n]}),even:pt(function(e,t){var n=0;for(;t>n;n+=2)e.push(n);return e}),odd:pt(function(e,t){var n=1;for(;t>n;n+=2)e.push(n);return e}),lt:pt(function(e,t,n){var r=0>n?n+t:n;for(;--r>=0;)e.push(r);return e}),gt:pt(function(e,t,n){var r=0>n?n+t:n;for(;t>++r;)e.push(r);return e})}};for(n in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})i.pseudos[n]=lt(n);for(n in{submit:!0,reset:!0})i.pseudos[n]=ct(n);function ft(e,t){var n,r,o,a,s,u,l,c=E[e+" "];if(c)return t?0:c.slice(0);s=e,u=[],l=i.preFilter;while(s){(!n||(r=$.exec(s)))&&(r&&(s=s.slice(r[0].length)||s),u.push(o=[])),n=!1,(r=I.exec(s))&&(n=r.shift(),o.push({value:n,type:r[0].replace(W," ")}),s=s.slice(n.length));for(a in i.filter)!(r=U[a].exec(s))||l[a]&&!(r=l[a](r))||(n=r.shift(),o.push({value:n,type:a,matches:r}),s=s.slice(n.length));if(!n)break}return t?s.length:s?st.error(e):E(e,u).slice(0)}function dt(e){var t=0,n=e.length,r="";for(;n>t;t++)r+=e[t].value;return r}function ht(e,t,n){var i=t.dir,o=n&&"parentNode"===i,a=C++;return t.first?function(t,n,r){while(t=t[i])if(1===t.nodeType||o)return e(t,n,r)}:function(t,n,s){var u,l,c,p=N+" "+a;if(s){while(t=t[i])if((1===t.nodeType||o)&&e(t,n,s))return!0}else while(t=t[i])if(1===t.nodeType||o)if(c=t[x]||(t[x]={}),(l=c[i])&&l[0]===p){if((u=l[1])===!0||u===r)return u===!0}else if(l=c[i]=[p],l[1]=e(t,n,s)||r,l[1]===!0)return!0}}function gt(e){return e.length>1?function(t,n,r){var i=e.length;while(i--)if(!e[i](t,n,r))return!1;return!0}:e[0]}function mt(e,t,n,r,i){var o,a=[],s=0,u=e.length,l=null!=t;for(;u>s;s++)(o=e[s])&&(!n||n(o,r,i))&&(a.push(o),l&&t.push(s));return a}function yt(e,t,n,r,i,o){return r&&!r[x]&&(r=yt(r)),i&&!i[x]&&(i=yt(i,o)),ot(function(o,a,s,u){var l,c,p,f=[],d=[],h=a.length,g=o||xt(t||"*",s.nodeType?[s]:s,[]),m=!e||!o&&t?g:mt(g,f,e,s,u),y=n?i||(o?e:h||r)?[]:a:m;if(n&&n(m,y,s,u),r){l=mt(y,d),r(l,[],s,u),c=l.length;while(c--)(p=l[c])&&(y[d[c]]=!(m[d[c]]=p))}if(o){if(i||e){if(i){l=[],c=y.length;while(c--)(p=y[c])&&l.push(m[c]=p);i(null,y=[],l,u)}c=y.length;while(c--)(p=y[c])&&(l=i?M.call(o,p):f[c])>-1&&(o[l]=!(a[l]=p))}}else y=mt(y===a?y.splice(h,y.length):y),i?i(null,a,y,u):H.apply(a,y)})}function vt(e){var t,n,r,o=e.length,a=i.relative[e[0].type],s=a||i.relative[" "],u=a?1:0,c=ht(function(e){return e===t},s,!0),p=ht(function(e){return M.call(t,e)>-1},s,!0),f=[function(e,n,r){return!a&&(r||n!==l)||((t=n).nodeType?c(e,n,r):p(e,n,r))}];for(;o>u;u++)if(n=i.relative[e[u].type])f=[ht(gt(f),n)];else{if(n=i.filter[e[u].type].apply(null,e[u].matches),n[x]){for(r=++u;o>r;r++)if(i.relative[e[r].type])break;return yt(u>1&&gt(f),u>1&&dt(e.slice(0,u-1)).replace(W,"$1"),n,r>u&&vt(e.slice(u,r)),o>r&&vt(e=e.slice(r)),o>r&&dt(e))}f.push(n)}return gt(f)}function bt(e,t){var n=0,o=t.length>0,a=e.length>0,s=function(s,u,c,f,d){var h,g,m,y=[],v=0,b="0",x=s&&[],w=null!=d,T=l,C=s||a&&i.find.TAG("*",d&&u.parentNode||u),k=N+=null==T?1:Math.random()||.1;for(w&&(l=u!==p&&u,r=n);null!=(h=C[b]);b++){if(a&&h){g=0;while(m=e[g++])if(m(h,u,c)){f.push(h);break}w&&(N=k,r=++n)}o&&((h=!m&&h)&&v--,s&&x.push(h))}if(v+=b,o&&b!==v){g=0;while(m=t[g++])m(x,y,u,c);if(s){if(v>0)while(b--)x[b]||y[b]||(y[b]=L.call(f));y=mt(y)}H.apply(f,y),w&&!s&&y.length>0&&v+t.length>1&&st.uniqueSort(f)}return w&&(N=k,l=T),x};return o?ot(s):s}s=st.compile=function(e,t){var n,r=[],i=[],o=S[e+" "];if(!o){t||(t=ft(e)),n=t.length;while(n--)o=vt(t[n]),o[x]?r.push(o):i.push(o);o=S(e,bt(i,r))}return o};function xt(e,t,n){var r=0,i=t.length;for(;i>r;r++)st(e,t[r],n);return n}function wt(e,t,n,r){var o,a,u,l,c,p=ft(e);if(!r&&1===p.length){if(a=p[0]=p[0].slice(0),a.length>2&&"ID"===(u=a[0]).type&&9===t.nodeType&&!d&&i.relative[a[1].type]){if(t=i.find.ID(u.matches[0].replace(et,tt),t)[0],!t)return n;e=e.slice(a.shift().value.length)}o=U.needsContext.test(e)?0:a.length;while(o--){if(u=a[o],i.relative[l=u.type])break;if((c=i.find[l])&&(r=c(u.matches[0].replace(et,tt),V.test(a[0].type)&&t.parentNode||t))){if(a.splice(o,1),e=r.length&&dt(a),!e)return H.apply(n,q.call(r,0)),n;break}}}return s(e,p)(r,t,d,n,V.test(e)),n}i.pseudos.nth=i.pseudos.eq;function Tt(){}i.filters=Tt.prototype=i.pseudos,i.setFilters=new Tt,c(),st.attr=b.attr,b.find=st,b.expr=st.selectors,b.expr[":"]=b.expr.pseudos,b.unique=st.uniqueSort,b.text=st.getText,b.isXMLDoc=st.isXML,b.contains=st.contains}(e);var at=/Until$/,st=/^(?:parents|prev(?:Until|All))/,ut=/^.[^:#\[\.,]*$/,lt=b.expr.match.needsContext,ct={children:!0,contents:!0,next:!0,prev:!0};b.fn.extend({find:function(e){var t,n,r,i=this.length;if("string"!=typeof e)return r=this,this.pushStack(b(e).filter(function(){for(t=0;i>t;t++)if(b.contains(r[t],this))return!0}));for(n=[],t=0;i>t;t++)b.find(e,this[t],n);return n=this.pushStack(i>1?b.unique(n):n),n.selector=(this.selector?this.selector+" ":"")+e,n},has:function(e){var t,n=b(e,this),r=n.length;return this.filter(function(){for(t=0;r>t;t++)if(b.contains(this,n[t]))return!0})},not:function(e){return this.pushStack(ft(this,e,!1))},filter:function(e){return this.pushStack(ft(this,e,!0))},is:function(e){return!!e&&("string"==typeof e?lt.test(e)?b(e,this.context).index(this[0])>=0:b.filter(e,this).length>0:this.filter(e).length>0)},closest:function(e,t){var n,r=0,i=this.length,o=[],a=lt.test(e)||"string"!=typeof e?b(e,t||this.context):0;for(;i>r;r++){n=this[r];while(n&&n.ownerDocument&&n!==t&&11!==n.nodeType){if(a?a.index(n)>-1:b.find.matchesSelector(n,e)){o.push(n);break}n=n.parentNode}}return this.pushStack(o.length>1?b.unique(o):o)},index:function(e){return e?"string"==typeof e?b.inArray(this[0],b(e)):b.inArray(e.jquery?e[0]:e,this):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){var n="string"==typeof e?b(e,t):b.makeArray(e&&e.nodeType?[e]:e),r=b.merge(this.get(),n);return this.pushStack(b.unique(r))},addBack:function(e){return this.add(null==e?this.prevObject:this.prevObject.filter(e))}}),b.fn.andSelf=b.fn.addBack;function pt(e,t){do e=e[t];while(e&&1!==e.nodeType);return e}b.each({parent:function(e){var t=e.parentNode;return t&&11!==t.nodeType?t:null},parents:function(e){return b.dir(e,"parentNode")},parentsUntil:function(e,t,n){return b.dir(e,"parentNode",n)},next:function(e){return pt(e,"nextSibling")},prev:function(e){return pt(e,"previousSibling")},nextAll:function(e){return b.dir(e,"nextSibling")},prevAll:function(e){return b.dir(e,"previousSibling")},nextUntil:function(e,t,n){return b.dir(e,"nextSibling",n)},prevUntil:function(e,t,n){return b.dir(e,"previousSibling",n)},siblings:function(e){return b.sibling((e.parentNode||{}).firstChild,e)},children:function(e){return b.sibling(e.firstChild)},contents:function(e){return b.nodeName(e,"iframe")?e.contentDocument||e.contentWindow.document:b.merge([],e.childNodes)}},function(e,t){b.fn[e]=function(n,r){var i=b.map(this,t,n);return at.test(e)||(r=n),r&&"string"==typeof r&&(i=b.filter(r,i)),i=this.length>1&&!ct[e]?b.unique(i):i,this.length>1&&st.test(e)&&(i=i.reverse()),this.pushStack(i)}}),b.extend({filter:function(e,t,n){return n&&(e=":not("+e+")"),1===t.length?b.find.matchesSelector(t[0],e)?[t[0]]:[]:b.find.matches(e,t)},dir:function(e,n,r){var i=[],o=e[n];while(o&&9!==o.nodeType&&(r===t||1!==o.nodeType||!b(o).is(r)))1===o.nodeType&&i.push(o),o=o[n];return i},sibling:function(e,t){var n=[];for(;e;e=e.nextSibling)1===e.nodeType&&e!==t&&n.push(e);return n}});function ft(e,t,n){if(t=t||0,b.isFunction(t))return b.grep(e,function(e,r){var i=!!t.call(e,r,e);return i===n});if(t.nodeType)return b.grep(e,function(e){return e===t===n});if("string"==typeof t){var r=b.grep(e,function(e){return 1===e.nodeType});if(ut.test(t))return b.filter(t,r,!n);t=b.filter(t,r)}return b.grep(e,function(e){return b.inArray(e,t)>=0===n})}function dt(e){var t=ht.split("|"),n=e.createDocumentFragment();if(n.createElement)while(t.length)n.createElement(t.pop());return n}var ht="abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",gt=/ jQuery\d+="(?:null|\d+)"/g,mt=RegExp("<(?:"+ht+")[\\s/>]","i"),yt=/^\s+/,vt=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,bt=/<([\w:]+)/,xt=/<tbody/i,wt=/<|&#?\w+;/,Tt=/<(?:script|style|link)/i,Nt=/^(?:checkbox|radio)$/i,Ct=/checked\s*(?:[^=]|=\s*.checked.)/i,kt=/^$|\/(?:java|ecma)script/i,Et=/^true\/(.*)/,St=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,At={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],area:[1,"<map>","</map>"],param:[1,"<object>","</object>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:b.support.htmlSerialize?[0,"",""]:[1,"X<div>","</div>"]},jt=dt(o),Dt=jt.appendChild(o.createElement("div"));At.optgroup=At.option,At.tbody=At.tfoot=At.colgroup=At.caption=At.thead,At.th=At.td,b.fn.extend({text:function(e){return b.access(this,function(e){return e===t?b.text(this):this.empty().append((this[0]&&this[0].ownerDocument||o).createTextNode(e))},null,e,arguments.length)},wrapAll:function(e){if(b.isFunction(e))return this.each(function(t){b(this).wrapAll(e.call(this,t))});if(this[0]){var t=b(e,this[0].ownerDocument).eq(0).clone(!0);this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstChild&&1===e.firstChild.nodeType)e=e.firstChild;return e}).append(this)}return this},wrapInner:function(e){return b.isFunction(e)?this.each(function(t){b(this).wrapInner(e.call(this,t))}):this.each(function(){var t=b(this),n=t.contents();n.length?n.wrapAll(e):t.append(e)})},wrap:function(e){var t=b.isFunction(e);return this.each(function(n){b(this).wrapAll(t?e.call(this,n):e)})},unwrap:function(){return this.parent().each(function(){b.nodeName(this,"body")||b(this).replaceWith(this.childNodes)}).end()},append:function(){return this.domManip(arguments,!0,function(e){(1===this.nodeType||11===this.nodeType||9===this.nodeType)&&this.appendChild(e)})},prepend:function(){return this.domManip(arguments,!0,function(e){(1===this.nodeType||11===this.nodeType||9===this.nodeType)&&this.insertBefore(e,this.firstChild)})},before:function(){return this.domManip(arguments,!1,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return this.domManip(arguments,!1,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},remove:function(e,t){var n,r=0;for(;null!=(n=this[r]);r++)(!e||b.filter(e,[n]).length>0)&&(t||1!==n.nodeType||b.cleanData(Ot(n)),n.parentNode&&(t&&b.contains(n.ownerDocument,n)&&Mt(Ot(n,"script")),n.parentNode.removeChild(n)));return this},empty:function(){var e,t=0;for(;null!=(e=this[t]);t++){1===e.nodeType&&b.cleanData(Ot(e,!1));while(e.firstChild)e.removeChild(e.firstChild);e.options&&b.nodeName(e,"select")&&(e.options.length=0)}return this},clone:function(e,t){return e=null==e?!1:e,t=null==t?e:t,this.map(function(){return b.clone(this,e,t)})},html:function(e){return b.access(this,function(e){var n=this[0]||{},r=0,i=this.length;if(e===t)return 1===n.nodeType?n.innerHTML.replace(gt,""):t;if(!("string"!=typeof e||Tt.test(e)||!b.support.htmlSerialize&&mt.test(e)||!b.support.leadingWhitespace&&yt.test(e)||At[(bt.exec(e)||["",""])[1].toLowerCase()])){e=e.replace(vt,"<$1></$2>");try{for(;i>r;r++)n=this[r]||{},1===n.nodeType&&(b.cleanData(Ot(n,!1)),n.innerHTML=e);n=0}catch(o){}}n&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(e){var t=b.isFunction(e);return t||"string"==typeof e||(e=b(e).not(this).detach()),this.domManip([e],!0,function(e){var t=this.nextSibling,n=this.parentNode;n&&(b(this).remove(),n.insertBefore(e,t))})},detach:function(e){return this.remove(e,!0)},domManip:function(e,n,r){e=f.apply([],e);var i,o,a,s,u,l,c=0,p=this.length,d=this,h=p-1,g=e[0],m=b.isFunction(g);if(m||!(1>=p||"string"!=typeof g||b.support.checkClone)&&Ct.test(g))return this.each(function(i){var o=d.eq(i);m&&(e[0]=g.call(this,i,n?o.html():t)),o.domManip(e,n,r)});if(p&&(l=b.buildFragment(e,this[0].ownerDocument,!1,this),i=l.firstChild,1===l.childNodes.length&&(l=i),i)){for(n=n&&b.nodeName(i,"tr"),s=b.map(Ot(l,"script"),Ht),a=s.length;p>c;c++)o=l,c!==h&&(o=b.clone(o,!0,!0),a&&b.merge(s,Ot(o,"script"))),r.call(n&&b.nodeName(this[c],"table")?Lt(this[c],"tbody"):this[c],o,c);if(a)for(u=s[s.length-1].ownerDocument,b.map(s,qt),c=0;a>c;c++)o=s[c],kt.test(o.type||"")&&!b._data(o,"globalEval")&&b.contains(u,o)&&(o.src?b.ajax({url:o.src,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0}):b.globalEval((o.text||o.textContent||o.innerHTML||"").replace(St,"")));l=i=null}return this}});function Lt(e,t){return e.getElementsByTagName(t)[0]||e.appendChild(e.ownerDocument.createElement(t))}function Ht(e){var t=e.getAttributeNode("type");return e.type=(t&&t.specified)+"/"+e.type,e}function qt(e){var t=Et.exec(e.type);return t?e.type=t[1]:e.removeAttribute("type"),e}function Mt(e,t){var n,r=0;for(;null!=(n=e[r]);r++)b._data(n,"globalEval",!t||b._data(t[r],"globalEval"))}function _t(e,t){if(1===t.nodeType&&b.hasData(e)){var n,r,i,o=b._data(e),a=b._data(t,o),s=o.events;if(s){delete a.handle,a.events={};for(n in s)for(r=0,i=s[n].length;i>r;r++)b.event.add(t,n,s[n][r])}a.data&&(a.data=b.extend({},a.data))}}function Ft(e,t){var n,r,i;if(1===t.nodeType){if(n=t.nodeName.toLowerCase(),!b.support.noCloneEvent&&t[b.expando]){i=b._data(t);for(r in i.events)b.removeEvent(t,r,i.handle);t.removeAttribute(b.expando)}"script"===n&&t.text!==e.text?(Ht(t).text=e.text,qt(t)):"object"===n?(t.parentNode&&(t.outerHTML=e.outerHTML),b.support.html5Clone&&e.innerHTML&&!b.trim(t.innerHTML)&&(t.innerHTML=e.innerHTML)):"input"===n&&Nt.test(e.type)?(t.defaultChecked=t.checked=e.checked,t.value!==e.value&&(t.value=e.value)):"option"===n?t.defaultSelected=t.selected=e.defaultSelected:("input"===n||"textarea"===n)&&(t.defaultValue=e.defaultValue)}}b.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,t){b.fn[e]=function(e){var n,r=0,i=[],o=b(e),a=o.length-1;for(;a>=r;r++)n=r===a?this:this.clone(!0),b(o[r])[t](n),d.apply(i,n.get());return this.pushStack(i)}});function Ot(e,n){var r,o,a=0,s=typeof e.getElementsByTagName!==i?e.getElementsByTagName(n||"*"):typeof e.querySelectorAll!==i?e.querySelectorAll(n||"*"):t;if(!s)for(s=[],r=e.childNodes||e;null!=(o=r[a]);a++)!n||b.nodeName(o,n)?s.push(o):b.merge(s,Ot(o,n));return n===t||n&&b.nodeName(e,n)?b.merge([e],s):s}function Bt(e){Nt.test(e.type)&&(e.defaultChecked=e.checked)}b.extend({clone:function(e,t,n){var r,i,o,a,s,u=b.contains(e.ownerDocument,e);if(b.support.html5Clone||b.isXMLDoc(e)||!mt.test("<"+e.nodeName+">")?o=e.cloneNode(!0):(Dt.innerHTML=e.outerHTML,Dt.removeChild(o=Dt.firstChild)),!(b.support.noCloneEvent&&b.support.noCloneChecked||1!==e.nodeType&&11!==e.nodeType||b.isXMLDoc(e)))for(r=Ot(o),s=Ot(e),a=0;null!=(i=s[a]);++a)r[a]&&Ft(i,r[a]);if(t)if(n)for(s=s||Ot(e),r=r||Ot(o),a=0;null!=(i=s[a]);a++)_t(i,r[a]);else _t(e,o);return r=Ot(o,"script"),r.length>0&&Mt(r,!u&&Ot(e,"script")),r=s=i=null,o},buildFragment:function(e,t,n,r){var i,o,a,s,u,l,c,p=e.length,f=dt(t),d=[],h=0;for(;p>h;h++)if(o=e[h],o||0===o)if("object"===b.type(o))b.merge(d,o.nodeType?[o]:o);else if(wt.test(o)){s=s||f.appendChild(t.createElement("div")),u=(bt.exec(o)||["",""])[1].toLowerCase(),c=At[u]||At._default,s.innerHTML=c[1]+o.replace(vt,"<$1></$2>")+c[2],i=c[0];while(i--)s=s.lastChild;if(!b.support.leadingWhitespace&&yt.test(o)&&d.push(t.createTextNode(yt.exec(o)[0])),!b.support.tbody){o="table"!==u||xt.test(o)?"<table>"!==c[1]||xt.test(o)?0:s:s.firstChild,i=o&&o.childNodes.length;while(i--)b.nodeName(l=o.childNodes[i],"tbody")&&!l.childNodes.length&&o.removeChild(l)
}b.merge(d,s.childNodes),s.textContent="";while(s.firstChild)s.removeChild(s.firstChild);s=f.lastChild}else d.push(t.createTextNode(o));s&&f.removeChild(s),b.support.appendChecked||b.grep(Ot(d,"input"),Bt),h=0;while(o=d[h++])if((!r||-1===b.inArray(o,r))&&(a=b.contains(o.ownerDocument,o),s=Ot(f.appendChild(o),"script"),a&&Mt(s),n)){i=0;while(o=s[i++])kt.test(o.type||"")&&n.push(o)}return s=null,f},cleanData:function(e,t){var n,r,o,a,s=0,u=b.expando,l=b.cache,p=b.support.deleteExpando,f=b.event.special;for(;null!=(n=e[s]);s++)if((t||b.acceptData(n))&&(o=n[u],a=o&&l[o])){if(a.events)for(r in a.events)f[r]?b.event.remove(n,r):b.removeEvent(n,r,a.handle);l[o]&&(delete l[o],p?delete n[u]:typeof n.removeAttribute!==i?n.removeAttribute(u):n[u]=null,c.push(o))}}});var Pt,Rt,Wt,$t=/alpha\([^)]*\)/i,It=/opacity\s*=\s*([^)]*)/,zt=/^(top|right|bottom|left)$/,Xt=/^(none|table(?!-c[ea]).+)/,Ut=/^margin/,Vt=RegExp("^("+x+")(.*)$","i"),Yt=RegExp("^("+x+")(?!px)[a-z%]+$","i"),Jt=RegExp("^([+-])=("+x+")","i"),Gt={BODY:"block"},Qt={position:"absolute",visibility:"hidden",display:"block"},Kt={letterSpacing:0,fontWeight:400},Zt=["Top","Right","Bottom","Left"],en=["Webkit","O","Moz","ms"];function tn(e,t){if(t in e)return t;var n=t.charAt(0).toUpperCase()+t.slice(1),r=t,i=en.length;while(i--)if(t=en[i]+n,t in e)return t;return r}function nn(e,t){return e=t||e,"none"===b.css(e,"display")||!b.contains(e.ownerDocument,e)}function rn(e,t){var n,r,i,o=[],a=0,s=e.length;for(;s>a;a++)r=e[a],r.style&&(o[a]=b._data(r,"olddisplay"),n=r.style.display,t?(o[a]||"none"!==n||(r.style.display=""),""===r.style.display&&nn(r)&&(o[a]=b._data(r,"olddisplay",un(r.nodeName)))):o[a]||(i=nn(r),(n&&"none"!==n||!i)&&b._data(r,"olddisplay",i?n:b.css(r,"display"))));for(a=0;s>a;a++)r=e[a],r.style&&(t&&"none"!==r.style.display&&""!==r.style.display||(r.style.display=t?o[a]||"":"none"));return e}b.fn.extend({css:function(e,n){return b.access(this,function(e,n,r){var i,o,a={},s=0;if(b.isArray(n)){for(o=Rt(e),i=n.length;i>s;s++)a[n[s]]=b.css(e,n[s],!1,o);return a}return r!==t?b.style(e,n,r):b.css(e,n)},e,n,arguments.length>1)},show:function(){return rn(this,!0)},hide:function(){return rn(this)},toggle:function(e){var t="boolean"==typeof e;return this.each(function(){(t?e:nn(this))?b(this).show():b(this).hide()})}}),b.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=Wt(e,"opacity");return""===n?"1":n}}}},cssNumber:{columnCount:!0,fillOpacity:!0,fontWeight:!0,lineHeight:!0,opacity:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":b.support.cssFloat?"cssFloat":"styleFloat"},style:function(e,n,r,i){if(e&&3!==e.nodeType&&8!==e.nodeType&&e.style){var o,a,s,u=b.camelCase(n),l=e.style;if(n=b.cssProps[u]||(b.cssProps[u]=tn(l,u)),s=b.cssHooks[n]||b.cssHooks[u],r===t)return s&&"get"in s&&(o=s.get(e,!1,i))!==t?o:l[n];if(a=typeof r,"string"===a&&(o=Jt.exec(r))&&(r=(o[1]+1)*o[2]+parseFloat(b.css(e,n)),a="number"),!(null==r||"number"===a&&isNaN(r)||("number"!==a||b.cssNumber[u]||(r+="px"),b.support.clearCloneStyle||""!==r||0!==n.indexOf("background")||(l[n]="inherit"),s&&"set"in s&&(r=s.set(e,r,i))===t)))try{l[n]=r}catch(c){}}},css:function(e,n,r,i){var o,a,s,u=b.camelCase(n);return n=b.cssProps[u]||(b.cssProps[u]=tn(e.style,u)),s=b.cssHooks[n]||b.cssHooks[u],s&&"get"in s&&(a=s.get(e,!0,r)),a===t&&(a=Wt(e,n,i)),"normal"===a&&n in Kt&&(a=Kt[n]),""===r||r?(o=parseFloat(a),r===!0||b.isNumeric(o)?o||0:a):a},swap:function(e,t,n,r){var i,o,a={};for(o in t)a[o]=e.style[o],e.style[o]=t[o];i=n.apply(e,r||[]);for(o in t)e.style[o]=a[o];return i}}),e.getComputedStyle?(Rt=function(t){return e.getComputedStyle(t,null)},Wt=function(e,n,r){var i,o,a,s=r||Rt(e),u=s?s.getPropertyValue(n)||s[n]:t,l=e.style;return s&&(""!==u||b.contains(e.ownerDocument,e)||(u=b.style(e,n)),Yt.test(u)&&Ut.test(n)&&(i=l.width,o=l.minWidth,a=l.maxWidth,l.minWidth=l.maxWidth=l.width=u,u=s.width,l.width=i,l.minWidth=o,l.maxWidth=a)),u}):o.documentElement.currentStyle&&(Rt=function(e){return e.currentStyle},Wt=function(e,n,r){var i,o,a,s=r||Rt(e),u=s?s[n]:t,l=e.style;return null==u&&l&&l[n]&&(u=l[n]),Yt.test(u)&&!zt.test(n)&&(i=l.left,o=e.runtimeStyle,a=o&&o.left,a&&(o.left=e.currentStyle.left),l.left="fontSize"===n?"1em":u,u=l.pixelLeft+"px",l.left=i,a&&(o.left=a)),""===u?"auto":u});function on(e,t,n){var r=Vt.exec(t);return r?Math.max(0,r[1]-(n||0))+(r[2]||"px"):t}function an(e,t,n,r,i){var o=n===(r?"border":"content")?4:"width"===t?1:0,a=0;for(;4>o;o+=2)"margin"===n&&(a+=b.css(e,n+Zt[o],!0,i)),r?("content"===n&&(a-=b.css(e,"padding"+Zt[o],!0,i)),"margin"!==n&&(a-=b.css(e,"border"+Zt[o]+"Width",!0,i))):(a+=b.css(e,"padding"+Zt[o],!0,i),"padding"!==n&&(a+=b.css(e,"border"+Zt[o]+"Width",!0,i)));return a}function sn(e,t,n){var r=!0,i="width"===t?e.offsetWidth:e.offsetHeight,o=Rt(e),a=b.support.boxSizing&&"border-box"===b.css(e,"boxSizing",!1,o);if(0>=i||null==i){if(i=Wt(e,t,o),(0>i||null==i)&&(i=e.style[t]),Yt.test(i))return i;r=a&&(b.support.boxSizingReliable||i===e.style[t]),i=parseFloat(i)||0}return i+an(e,t,n||(a?"border":"content"),r,o)+"px"}function un(e){var t=o,n=Gt[e];return n||(n=ln(e,t),"none"!==n&&n||(Pt=(Pt||b("<iframe frameborder='0' width='0' height='0'/>").css("cssText","display:block !important")).appendTo(t.documentElement),t=(Pt[0].contentWindow||Pt[0].contentDocument).document,t.write("<!doctype html><html><body>"),t.close(),n=ln(e,t),Pt.detach()),Gt[e]=n),n}function ln(e,t){var n=b(t.createElement(e)).appendTo(t.body),r=b.css(n[0],"display");return n.remove(),r}b.each(["height","width"],function(e,n){b.cssHooks[n]={get:function(e,r,i){return r?0===e.offsetWidth&&Xt.test(b.css(e,"display"))?b.swap(e,Qt,function(){return sn(e,n,i)}):sn(e,n,i):t},set:function(e,t,r){var i=r&&Rt(e);return on(e,t,r?an(e,n,r,b.support.boxSizing&&"border-box"===b.css(e,"boxSizing",!1,i),i):0)}}}),b.support.opacity||(b.cssHooks.opacity={get:function(e,t){return It.test((t&&e.currentStyle?e.currentStyle.filter:e.style.filter)||"")?.01*parseFloat(RegExp.$1)+"":t?"1":""},set:function(e,t){var n=e.style,r=e.currentStyle,i=b.isNumeric(t)?"alpha(opacity="+100*t+")":"",o=r&&r.filter||n.filter||"";n.zoom=1,(t>=1||""===t)&&""===b.trim(o.replace($t,""))&&n.removeAttribute&&(n.removeAttribute("filter"),""===t||r&&!r.filter)||(n.filter=$t.test(o)?o.replace($t,i):o+" "+i)}}),b(function(){b.support.reliableMarginRight||(b.cssHooks.marginRight={get:function(e,n){return n?b.swap(e,{display:"inline-block"},Wt,[e,"marginRight"]):t}}),!b.support.pixelPosition&&b.fn.position&&b.each(["top","left"],function(e,n){b.cssHooks[n]={get:function(e,r){return r?(r=Wt(e,n),Yt.test(r)?b(e).position()[n]+"px":r):t}}})}),b.expr&&b.expr.filters&&(b.expr.filters.hidden=function(e){return 0>=e.offsetWidth&&0>=e.offsetHeight||!b.support.reliableHiddenOffsets&&"none"===(e.style&&e.style.display||b.css(e,"display"))},b.expr.filters.visible=function(e){return!b.expr.filters.hidden(e)}),b.each({margin:"",padding:"",border:"Width"},function(e,t){b.cssHooks[e+t]={expand:function(n){var r=0,i={},o="string"==typeof n?n.split(" "):[n];for(;4>r;r++)i[e+Zt[r]+t]=o[r]||o[r-2]||o[0];return i}},Ut.test(e)||(b.cssHooks[e+t].set=on)});var cn=/%20/g,pn=/\[\]$/,fn=/\r?\n/g,dn=/^(?:submit|button|image|reset|file)$/i,hn=/^(?:input|select|textarea|keygen)/i;b.fn.extend({serialize:function(){return b.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=b.prop(this,"elements");return e?b.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!b(this).is(":disabled")&&hn.test(this.nodeName)&&!dn.test(e)&&(this.checked||!Nt.test(e))}).map(function(e,t){var n=b(this).val();return null==n?null:b.isArray(n)?b.map(n,function(e){return{name:t.name,value:e.replace(fn,"\r\n")}}):{name:t.name,value:n.replace(fn,"\r\n")}}).get()}}),b.param=function(e,n){var r,i=[],o=function(e,t){t=b.isFunction(t)?t():null==t?"":t,i[i.length]=encodeURIComponent(e)+"="+encodeURIComponent(t)};if(n===t&&(n=b.ajaxSettings&&b.ajaxSettings.traditional),b.isArray(e)||e.jquery&&!b.isPlainObject(e))b.each(e,function(){o(this.name,this.value)});else for(r in e)gn(r,e[r],n,o);return i.join("&").replace(cn,"+")};function gn(e,t,n,r){var i;if(b.isArray(t))b.each(t,function(t,i){n||pn.test(e)?r(e,i):gn(e+"["+("object"==typeof i?t:"")+"]",i,n,r)});else if(n||"object"!==b.type(t))r(e,t);else for(i in t)gn(e+"["+i+"]",t[i],n,r)}b.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(e,t){b.fn[t]=function(e,n){return arguments.length>0?this.on(t,null,e,n):this.trigger(t)}}),b.fn.hover=function(e,t){return this.mouseenter(e).mouseleave(t||e)};var mn,yn,vn=b.now(),bn=/\?/,xn=/#.*$/,wn=/([?&])_=[^&]*/,Tn=/^(.*?):[ \t]*([^\r\n]*)\r?$/gm,Nn=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,Cn=/^(?:GET|HEAD)$/,kn=/^\/\//,En=/^([\w.+-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,Sn=b.fn.load,An={},jn={},Dn="*/".concat("*");try{yn=a.href}catch(Ln){yn=o.createElement("a"),yn.href="",yn=yn.href}mn=En.exec(yn.toLowerCase())||[];function Hn(e){return function(t,n){"string"!=typeof t&&(n=t,t="*");var r,i=0,o=t.toLowerCase().match(w)||[];if(b.isFunction(n))while(r=o[i++])"+"===r[0]?(r=r.slice(1)||"*",(e[r]=e[r]||[]).unshift(n)):(e[r]=e[r]||[]).push(n)}}function qn(e,n,r,i){var o={},a=e===jn;function s(u){var l;return o[u]=!0,b.each(e[u]||[],function(e,u){var c=u(n,r,i);return"string"!=typeof c||a||o[c]?a?!(l=c):t:(n.dataTypes.unshift(c),s(c),!1)}),l}return s(n.dataTypes[0])||!o["*"]&&s("*")}function Mn(e,n){var r,i,o=b.ajaxSettings.flatOptions||{};for(i in n)n[i]!==t&&((o[i]?e:r||(r={}))[i]=n[i]);return r&&b.extend(!0,e,r),e}b.fn.load=function(e,n,r){if("string"!=typeof e&&Sn)return Sn.apply(this,arguments);var i,o,a,s=this,u=e.indexOf(" ");return u>=0&&(i=e.slice(u,e.length),e=e.slice(0,u)),b.isFunction(n)?(r=n,n=t):n&&"object"==typeof n&&(a="POST"),s.length>0&&b.ajax({url:e,type:a,dataType:"html",data:n}).done(function(e){o=arguments,s.html(i?b("<div>").append(b.parseHTML(e)).find(i):e)}).complete(r&&function(e,t){s.each(r,o||[e.responseText,t,e])}),this},b.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){b.fn[t]=function(e){return this.on(t,e)}}),b.each(["get","post"],function(e,n){b[n]=function(e,r,i,o){return b.isFunction(r)&&(o=o||i,i=r,r=t),b.ajax({url:e,type:n,dataType:o,data:r,success:i})}}),b.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:yn,type:"GET",isLocal:Nn.test(mn[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":Dn,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText"},converters:{"* text":e.String,"text html":!0,"text json":b.parseJSON,"text xml":b.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?Mn(Mn(e,b.ajaxSettings),t):Mn(b.ajaxSettings,e)},ajaxPrefilter:Hn(An),ajaxTransport:Hn(jn),ajax:function(e,n){"object"==typeof e&&(n=e,e=t),n=n||{};var r,i,o,a,s,u,l,c,p=b.ajaxSetup({},n),f=p.context||p,d=p.context&&(f.nodeType||f.jquery)?b(f):b.event,h=b.Deferred(),g=b.Callbacks("once memory"),m=p.statusCode||{},y={},v={},x=0,T="canceled",N={readyState:0,getResponseHeader:function(e){var t;if(2===x){if(!c){c={};while(t=Tn.exec(a))c[t[1].toLowerCase()]=t[2]}t=c[e.toLowerCase()]}return null==t?null:t},getAllResponseHeaders:function(){return 2===x?a:null},setRequestHeader:function(e,t){var n=e.toLowerCase();return x||(e=v[n]=v[n]||e,y[e]=t),this},overrideMimeType:function(e){return x||(p.mimeType=e),this},statusCode:function(e){var t;if(e)if(2>x)for(t in e)m[t]=[m[t],e[t]];else N.always(e[N.status]);return this},abort:function(e){var t=e||T;return l&&l.abort(t),k(0,t),this}};if(h.promise(N).complete=g.add,N.success=N.done,N.error=N.fail,p.url=((e||p.url||yn)+"").replace(xn,"").replace(kn,mn[1]+"//"),p.type=n.method||n.type||p.method||p.type,p.dataTypes=b.trim(p.dataType||"*").toLowerCase().match(w)||[""],null==p.crossDomain&&(r=En.exec(p.url.toLowerCase()),p.crossDomain=!(!r||r[1]===mn[1]&&r[2]===mn[2]&&(r[3]||("http:"===r[1]?80:443))==(mn[3]||("http:"===mn[1]?80:443)))),p.data&&p.processData&&"string"!=typeof p.data&&(p.data=b.param(p.data,p.traditional)),qn(An,p,n,N),2===x)return N;u=p.global,u&&0===b.active++&&b.event.trigger("ajaxStart"),p.type=p.type.toUpperCase(),p.hasContent=!Cn.test(p.type),o=p.url,p.hasContent||(p.data&&(o=p.url+=(bn.test(o)?"&":"?")+p.data,delete p.data),p.cache===!1&&(p.url=wn.test(o)?o.replace(wn,"$1_="+vn++):o+(bn.test(o)?"&":"?")+"_="+vn++)),p.ifModified&&(b.lastModified[o]&&N.setRequestHeader("If-Modified-Since",b.lastModified[o]),b.etag[o]&&N.setRequestHeader("If-None-Match",b.etag[o])),(p.data&&p.hasContent&&p.contentType!==!1||n.contentType)&&N.setRequestHeader("Content-Type",p.contentType),N.setRequestHeader("Accept",p.dataTypes[0]&&p.accepts[p.dataTypes[0]]?p.accepts[p.dataTypes[0]]+("*"!==p.dataTypes[0]?", "+Dn+"; q=0.01":""):p.accepts["*"]);for(i in p.headers)N.setRequestHeader(i,p.headers[i]);if(p.beforeSend&&(p.beforeSend.call(f,N,p)===!1||2===x))return N.abort();T="abort";for(i in{success:1,error:1,complete:1})N[i](p[i]);if(l=qn(jn,p,n,N)){N.readyState=1,u&&d.trigger("ajaxSend",[N,p]),p.async&&p.timeout>0&&(s=setTimeout(function(){N.abort("timeout")},p.timeout));try{x=1,l.send(y,k)}catch(C){if(!(2>x))throw C;k(-1,C)}}else k(-1,"No Transport");function k(e,n,r,i){var c,y,v,w,T,C=n;2!==x&&(x=2,s&&clearTimeout(s),l=t,a=i||"",N.readyState=e>0?4:0,r&&(w=_n(p,N,r)),e>=200&&300>e||304===e?(p.ifModified&&(T=N.getResponseHeader("Last-Modified"),T&&(b.lastModified[o]=T),T=N.getResponseHeader("etag"),T&&(b.etag[o]=T)),204===e?(c=!0,C="nocontent"):304===e?(c=!0,C="notmodified"):(c=Fn(p,w),C=c.state,y=c.data,v=c.error,c=!v)):(v=C,(e||!C)&&(C="error",0>e&&(e=0))),N.status=e,N.statusText=(n||C)+"",c?h.resolveWith(f,[y,C,N]):h.rejectWith(f,[N,C,v]),N.statusCode(m),m=t,u&&d.trigger(c?"ajaxSuccess":"ajaxError",[N,p,c?y:v]),g.fireWith(f,[N,C]),u&&(d.trigger("ajaxComplete",[N,p]),--b.active||b.event.trigger("ajaxStop")))}return N},getScript:function(e,n){return b.get(e,t,n,"script")},getJSON:function(e,t,n){return b.get(e,t,n,"json")}});function _n(e,n,r){var i,o,a,s,u=e.contents,l=e.dataTypes,c=e.responseFields;for(s in c)s in r&&(n[c[s]]=r[s]);while("*"===l[0])l.shift(),o===t&&(o=e.mimeType||n.getResponseHeader("Content-Type"));if(o)for(s in u)if(u[s]&&u[s].test(o)){l.unshift(s);break}if(l[0]in r)a=l[0];else{for(s in r){if(!l[0]||e.converters[s+" "+l[0]]){a=s;break}i||(i=s)}a=a||i}return a?(a!==l[0]&&l.unshift(a),r[a]):t}function Fn(e,t){var n,r,i,o,a={},s=0,u=e.dataTypes.slice(),l=u[0];if(e.dataFilter&&(t=e.dataFilter(t,e.dataType)),u[1])for(i in e.converters)a[i.toLowerCase()]=e.converters[i];for(;r=u[++s];)if("*"!==r){if("*"!==l&&l!==r){if(i=a[l+" "+r]||a["* "+r],!i)for(n in a)if(o=n.split(" "),o[1]===r&&(i=a[l+" "+o[0]]||a["* "+o[0]])){i===!0?i=a[n]:a[n]!==!0&&(r=o[0],u.splice(s--,0,r));break}if(i!==!0)if(i&&e["throws"])t=i(t);else try{t=i(t)}catch(c){return{state:"parsererror",error:i?c:"No conversion from "+l+" to "+r}}}l=r}return{state:"success",data:t}}b.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(e){return b.globalEval(e),e}}}),b.ajaxPrefilter("script",function(e){e.cache===t&&(e.cache=!1),e.crossDomain&&(e.type="GET",e.global=!1)}),b.ajaxTransport("script",function(e){if(e.crossDomain){var n,r=o.head||b("head")[0]||o.documentElement;return{send:function(t,i){n=o.createElement("script"),n.async=!0,e.scriptCharset&&(n.charset=e.scriptCharset),n.src=e.url,n.onload=n.onreadystatechange=function(e,t){(t||!n.readyState||/loaded|complete/.test(n.readyState))&&(n.onload=n.onreadystatechange=null,n.parentNode&&n.parentNode.removeChild(n),n=null,t||i(200,"success"))},r.insertBefore(n,r.firstChild)},abort:function(){n&&n.onload(t,!0)}}}});var On=[],Bn=/(=)\?(?=&|$)|\?\?/;b.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=On.pop()||b.expando+"_"+vn++;return this[e]=!0,e}}),b.ajaxPrefilter("json jsonp",function(n,r,i){var o,a,s,u=n.jsonp!==!1&&(Bn.test(n.url)?"url":"string"==typeof n.data&&!(n.contentType||"").indexOf("application/x-www-form-urlencoded")&&Bn.test(n.data)&&"data");return u||"jsonp"===n.dataTypes[0]?(o=n.jsonpCallback=b.isFunction(n.jsonpCallback)?n.jsonpCallback():n.jsonpCallback,u?n[u]=n[u].replace(Bn,"$1"+o):n.jsonp!==!1&&(n.url+=(bn.test(n.url)?"&":"?")+n.jsonp+"="+o),n.converters["script json"]=function(){return s||b.error(o+" was not called"),s[0]},n.dataTypes[0]="json",a=e[o],e[o]=function(){s=arguments},i.always(function(){e[o]=a,n[o]&&(n.jsonpCallback=r.jsonpCallback,On.push(o)),s&&b.isFunction(a)&&a(s[0]),s=a=t}),"script"):t});var Pn,Rn,Wn=0,$n=e.ActiveXObject&&function(){var e;for(e in Pn)Pn[e](t,!0)};function In(){try{return new e.XMLHttpRequest}catch(t){}}function zn(){try{return new e.ActiveXObject("Microsoft.XMLHTTP")}catch(t){}}b.ajaxSettings.xhr=e.ActiveXObject?function(){return!this.isLocal&&In()||zn()}:In,Rn=b.ajaxSettings.xhr(),b.support.cors=!!Rn&&"withCredentials"in Rn,Rn=b.support.ajax=!!Rn,Rn&&b.ajaxTransport(function(n){if(!n.crossDomain||b.support.cors){var r;return{send:function(i,o){var a,s,u=n.xhr();if(n.username?u.open(n.type,n.url,n.async,n.username,n.password):u.open(n.type,n.url,n.async),n.xhrFields)for(s in n.xhrFields)u[s]=n.xhrFields[s];n.mimeType&&u.overrideMimeType&&u.overrideMimeType(n.mimeType),n.crossDomain||i["X-Requested-With"]||(i["X-Requested-With"]="XMLHttpRequest");try{for(s in i)u.setRequestHeader(s,i[s])}catch(l){}u.send(n.hasContent&&n.data||null),r=function(e,i){var s,l,c,p;try{if(r&&(i||4===u.readyState))if(r=t,a&&(u.onreadystatechange=b.noop,$n&&delete Pn[a]),i)4!==u.readyState&&u.abort();else{p={},s=u.status,l=u.getAllResponseHeaders(),"string"==typeof u.responseText&&(p.text=u.responseText);try{c=u.statusText}catch(f){c=""}s||!n.isLocal||n.crossDomain?1223===s&&(s=204):s=p.text?200:404}}catch(d){i||o(-1,d)}p&&o(s,c,p,l)},n.async?4===u.readyState?setTimeout(r):(a=++Wn,$n&&(Pn||(Pn={},b(e).unload($n)),Pn[a]=r),u.onreadystatechange=r):r()},abort:function(){r&&r(t,!0)}}}});var Xn,Un,Vn=/^(?:toggle|show|hide)$/,Yn=RegExp("^(?:([+-])=|)("+x+")([a-z%]*)$","i"),Jn=/queueHooks$/,Gn=[nr],Qn={"*":[function(e,t){var n,r,i=this.createTween(e,t),o=Yn.exec(t),a=i.cur(),s=+a||0,u=1,l=20;if(o){if(n=+o[2],r=o[3]||(b.cssNumber[e]?"":"px"),"px"!==r&&s){s=b.css(i.elem,e,!0)||n||1;do u=u||".5",s/=u,b.style(i.elem,e,s+r);while(u!==(u=i.cur()/a)&&1!==u&&--l)}i.unit=r,i.start=s,i.end=o[1]?s+(o[1]+1)*n:n}return i}]};function Kn(){return setTimeout(function(){Xn=t}),Xn=b.now()}function Zn(e,t){b.each(t,function(t,n){var r=(Qn[t]||[]).concat(Qn["*"]),i=0,o=r.length;for(;o>i;i++)if(r[i].call(e,t,n))return})}function er(e,t,n){var r,i,o=0,a=Gn.length,s=b.Deferred().always(function(){delete u.elem}),u=function(){if(i)return!1;var t=Xn||Kn(),n=Math.max(0,l.startTime+l.duration-t),r=n/l.duration||0,o=1-r,a=0,u=l.tweens.length;for(;u>a;a++)l.tweens[a].run(o);return s.notifyWith(e,[l,o,n]),1>o&&u?n:(s.resolveWith(e,[l]),!1)},l=s.promise({elem:e,props:b.extend({},t),opts:b.extend(!0,{specialEasing:{}},n),originalProperties:t,originalOptions:n,startTime:Xn||Kn(),duration:n.duration,tweens:[],createTween:function(t,n){var r=b.Tween(e,l.opts,t,n,l.opts.specialEasing[t]||l.opts.easing);return l.tweens.push(r),r},stop:function(t){var n=0,r=t?l.tweens.length:0;if(i)return this;for(i=!0;r>n;n++)l.tweens[n].run(1);return t?s.resolveWith(e,[l,t]):s.rejectWith(e,[l,t]),this}}),c=l.props;for(tr(c,l.opts.specialEasing);a>o;o++)if(r=Gn[o].call(l,e,c,l.opts))return r;return Zn(l,c),b.isFunction(l.opts.start)&&l.opts.start.call(e,l),b.fx.timer(b.extend(u,{elem:e,anim:l,queue:l.opts.queue})),l.progress(l.opts.progress).done(l.opts.done,l.opts.complete).fail(l.opts.fail).always(l.opts.always)}function tr(e,t){var n,r,i,o,a;for(i in e)if(r=b.camelCase(i),o=t[r],n=e[i],b.isArray(n)&&(o=n[1],n=e[i]=n[0]),i!==r&&(e[r]=n,delete e[i]),a=b.cssHooks[r],a&&"expand"in a){n=a.expand(n),delete e[r];for(i in n)i in e||(e[i]=n[i],t[i]=o)}else t[r]=o}b.Animation=b.extend(er,{tweener:function(e,t){b.isFunction(e)?(t=e,e=["*"]):e=e.split(" ");var n,r=0,i=e.length;for(;i>r;r++)n=e[r],Qn[n]=Qn[n]||[],Qn[n].unshift(t)},prefilter:function(e,t){t?Gn.unshift(e):Gn.push(e)}});function nr(e,t,n){var r,i,o,a,s,u,l,c,p,f=this,d=e.style,h={},g=[],m=e.nodeType&&nn(e);n.queue||(c=b._queueHooks(e,"fx"),null==c.unqueued&&(c.unqueued=0,p=c.empty.fire,c.empty.fire=function(){c.unqueued||p()}),c.unqueued++,f.always(function(){f.always(function(){c.unqueued--,b.queue(e,"fx").length||c.empty.fire()})})),1===e.nodeType&&("height"in t||"width"in t)&&(n.overflow=[d.overflow,d.overflowX,d.overflowY],"inline"===b.css(e,"display")&&"none"===b.css(e,"float")&&(b.support.inlineBlockNeedsLayout&&"inline"!==un(e.nodeName)?d.zoom=1:d.display="inline-block")),n.overflow&&(d.overflow="hidden",b.support.shrinkWrapBlocks||f.always(function(){d.overflow=n.overflow[0],d.overflowX=n.overflow[1],d.overflowY=n.overflow[2]}));for(i in t)if(a=t[i],Vn.exec(a)){if(delete t[i],u=u||"toggle"===a,a===(m?"hide":"show"))continue;g.push(i)}if(o=g.length){s=b._data(e,"fxshow")||b._data(e,"fxshow",{}),"hidden"in s&&(m=s.hidden),u&&(s.hidden=!m),m?b(e).show():f.done(function(){b(e).hide()}),f.done(function(){var t;b._removeData(e,"fxshow");for(t in h)b.style(e,t,h[t])});for(i=0;o>i;i++)r=g[i],l=f.createTween(r,m?s[r]:0),h[r]=s[r]||b.style(e,r),r in s||(s[r]=l.start,m&&(l.end=l.start,l.start="width"===r||"height"===r?1:0))}}function rr(e,t,n,r,i){return new rr.prototype.init(e,t,n,r,i)}b.Tween=rr,rr.prototype={constructor:rr,init:function(e,t,n,r,i,o){this.elem=e,this.prop=n,this.easing=i||"swing",this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=o||(b.cssNumber[n]?"":"px")},cur:function(){var e=rr.propHooks[this.prop];return e&&e.get?e.get(this):rr.propHooks._default.get(this)},run:function(e){var t,n=rr.propHooks[this.prop];return this.pos=t=this.options.duration?b.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):rr.propHooks._default.set(this),this}},rr.prototype.init.prototype=rr.prototype,rr.propHooks={_default:{get:function(e){var t;return null==e.elem[e.prop]||e.elem.style&&null!=e.elem.style[e.prop]?(t=b.css(e.elem,e.prop,""),t&&"auto"!==t?t:0):e.elem[e.prop]},set:function(e){b.fx.step[e.prop]?b.fx.step[e.prop](e):e.elem.style&&(null!=e.elem.style[b.cssProps[e.prop]]||b.cssHooks[e.prop])?b.style(e.elem,e.prop,e.now+e.unit):e.elem[e.prop]=e.now}}},rr.propHooks.scrollTop=rr.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},b.each(["toggle","show","hide"],function(e,t){var n=b.fn[t];b.fn[t]=function(e,r,i){return null==e||"boolean"==typeof e?n.apply(this,arguments):this.animate(ir(t,!0),e,r,i)}}),b.fn.extend({fadeTo:function(e,t,n,r){return this.filter(nn).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(e,t,n,r){var i=b.isEmptyObject(e),o=b.speed(t,n,r),a=function(){var t=er(this,b.extend({},e),o);a.finish=function(){t.stop(!0)},(i||b._data(this,"finish"))&&t.stop(!0)};return a.finish=a,i||o.queue===!1?this.each(a):this.queue(o.queue,a)},stop:function(e,n,r){var i=function(e){var t=e.stop;delete e.stop,t(r)};return"string"!=typeof e&&(r=n,n=e,e=t),n&&e!==!1&&this.queue(e||"fx",[]),this.each(function(){var t=!0,n=null!=e&&e+"queueHooks",o=b.timers,a=b._data(this);if(n)a[n]&&a[n].stop&&i(a[n]);else for(n in a)a[n]&&a[n].stop&&Jn.test(n)&&i(a[n]);for(n=o.length;n--;)o[n].elem!==this||null!=e&&o[n].queue!==e||(o[n].anim.stop(r),t=!1,o.splice(n,1));(t||!r)&&b.dequeue(this,e)})},finish:function(e){return e!==!1&&(e=e||"fx"),this.each(function(){var t,n=b._data(this),r=n[e+"queue"],i=n[e+"queueHooks"],o=b.timers,a=r?r.length:0;for(n.finish=!0,b.queue(this,e,[]),i&&i.cur&&i.cur.finish&&i.cur.finish.call(this),t=o.length;t--;)o[t].elem===this&&o[t].queue===e&&(o[t].anim.stop(!0),o.splice(t,1));for(t=0;a>t;t++)r[t]&&r[t].finish&&r[t].finish.call(this);delete n.finish})}});function ir(e,t){var n,r={height:e},i=0;for(t=t?1:0;4>i;i+=2-t)n=Zt[i],r["margin"+n]=r["padding"+n]=e;return t&&(r.opacity=r.width=e),r}b.each({slideDown:ir("show"),slideUp:ir("hide"),slideToggle:ir("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,t){b.fn[e]=function(e,n,r){return this.animate(t,e,n,r)}}),b.speed=function(e,t,n){var r=e&&"object"==typeof e?b.extend({},e):{complete:n||!n&&t||b.isFunction(e)&&e,duration:e,easing:n&&t||t&&!b.isFunction(t)&&t};return r.duration=b.fx.off?0:"number"==typeof r.duration?r.duration:r.duration in b.fx.speeds?b.fx.speeds[r.duration]:b.fx.speeds._default,(null==r.queue||r.queue===!0)&&(r.queue="fx"),r.old=r.complete,r.complete=function(){b.isFunction(r.old)&&r.old.call(this),r.queue&&b.dequeue(this,r.queue)},r},b.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2}},b.timers=[],b.fx=rr.prototype.init,b.fx.tick=function(){var e,n=b.timers,r=0;for(Xn=b.now();n.length>r;r++)e=n[r],e()||n[r]!==e||n.splice(r--,1);n.length||b.fx.stop(),Xn=t},b.fx.timer=function(e){e()&&b.timers.push(e)&&b.fx.start()},b.fx.interval=13,b.fx.start=function(){Un||(Un=setInterval(b.fx.tick,b.fx.interval))},b.fx.stop=function(){clearInterval(Un),Un=null},b.fx.speeds={slow:600,fast:200,_default:400},b.fx.step={},b.expr&&b.expr.filters&&(b.expr.filters.animated=function(e){return b.grep(b.timers,function(t){return e===t.elem}).length}),b.fn.offset=function(e){if(arguments.length)return e===t?this:this.each(function(t){b.offset.setOffset(this,e,t)});var n,r,o={top:0,left:0},a=this[0],s=a&&a.ownerDocument;if(s)return n=s.documentElement,b.contains(n,a)?(typeof a.getBoundingClientRect!==i&&(o=a.getBoundingClientRect()),r=or(s),{top:o.top+(r.pageYOffset||n.scrollTop)-(n.clientTop||0),left:o.left+(r.pageXOffset||n.scrollLeft)-(n.clientLeft||0)}):o},b.offset={setOffset:function(e,t,n){var r=b.css(e,"position");"static"===r&&(e.style.position="relative");var i=b(e),o=i.offset(),a=b.css(e,"top"),s=b.css(e,"left"),u=("absolute"===r||"fixed"===r)&&b.inArray("auto",[a,s])>-1,l={},c={},p,f;u?(c=i.position(),p=c.top,f=c.left):(p=parseFloat(a)||0,f=parseFloat(s)||0),b.isFunction(t)&&(t=t.call(e,n,o)),null!=t.top&&(l.top=t.top-o.top+p),null!=t.left&&(l.left=t.left-o.left+f),"using"in t?t.using.call(e,l):i.css(l)}},b.fn.extend({position:function(){if(this[0]){var e,t,n={top:0,left:0},r=this[0];return"fixed"===b.css(r,"position")?t=r.getBoundingClientRect():(e=this.offsetParent(),t=this.offset(),b.nodeName(e[0],"html")||(n=e.offset()),n.top+=b.css(e[0],"borderTopWidth",!0),n.left+=b.css(e[0],"borderLeftWidth",!0)),{top:t.top-n.top-b.css(r,"marginTop",!0),left:t.left-n.left-b.css(r,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var e=this.offsetParent||o.documentElement;while(e&&!b.nodeName(e,"html")&&"static"===b.css(e,"position"))e=e.offsetParent;return e||o.documentElement})}}),b.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(e,n){var r=/Y/.test(n);b.fn[e]=function(i){return b.access(this,function(e,i,o){var a=or(e);return o===t?a?n in a?a[n]:a.document.documentElement[i]:e[i]:(a?a.scrollTo(r?b(a).scrollLeft():o,r?o:b(a).scrollTop()):e[i]=o,t)},e,i,arguments.length,null)}});function or(e){return b.isWindow(e)?e:9===e.nodeType?e.defaultView||e.parentWindow:!1}b.each({Height:"height",Width:"width"},function(e,n){b.each({padding:"inner"+e,content:n,"":"outer"+e},function(r,i){b.fn[i]=function(i,o){var a=arguments.length&&(r||"boolean"!=typeof i),s=r||(i===!0||o===!0?"margin":"border");return b.access(this,function(n,r,i){var o;return b.isWindow(n)?n.document.documentElement["client"+e]:9===n.nodeType?(o=n.documentElement,Math.max(n.body["scroll"+e],o["scroll"+e],n.body["offset"+e],o["offset"+e],o["client"+e])):i===t?b.css(n,r,s):b.style(n,r,i,s)},n,a?i:t,a,null)}})}),e.jQuery=e.$=b,"function"==typeof define&&define.amd&&define.amd.jQuery&&define("jquery",[],function(){return b})})(window);
/*! jQuery v2.0.2 | (c) 2005, 2013 jQuery Foundation, Inc. | jquery.org/license
//@ sourceMappingURL=jquery-2.0.2.min.map
*/
(function(e,undefined){var t,n,r=typeof undefined,i=e.location,o=e.document,s=o.documentElement,a=e.jQuery,u=e.$,l={},c=[],p="2.0.2",f=c.concat,h=c.push,d=c.slice,g=c.indexOf,m=l.toString,y=l.hasOwnProperty,v=p.trim,x=function(e,n){return new x.fn.init(e,n,t)},b=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,w=/\S+/g,T=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,C=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,k=/^-ms-/,N=/-([\da-z])/gi,E=function(e,t){return t.toUpperCase()},S=function(){o.removeEventListener("DOMContentLoaded",S,!1),e.removeEventListener("load",S,!1),x.ready()};x.fn=x.prototype={jquery:p,constructor:x,init:function(e,t,n){var r,i;if(!e)return this;if("string"==typeof e){if(r="<"===e.charAt(0)&&">"===e.charAt(e.length-1)&&e.length>=3?[null,e,null]:T.exec(e),!r||!r[1]&&t)return!t||t.jquery?(t||n).find(e):this.constructor(t).find(e);if(r[1]){if(t=t instanceof x?t[0]:t,x.merge(this,x.parseHTML(r[1],t&&t.nodeType?t.ownerDocument||t:o,!0)),C.test(r[1])&&x.isPlainObject(t))for(r in t)x.isFunction(this[r])?this[r](t[r]):this.attr(r,t[r]);return this}return i=o.getElementById(r[2]),i&&i.parentNode&&(this.length=1,this[0]=i),this.context=o,this.selector=e,this}return e.nodeType?(this.context=this[0]=e,this.length=1,this):x.isFunction(e)?n.ready(e):(e.selector!==undefined&&(this.selector=e.selector,this.context=e.context),x.makeArray(e,this))},selector:"",length:0,toArray:function(){return d.call(this)},get:function(e){return null==e?this.toArray():0>e?this[this.length+e]:this[e]},pushStack:function(e){var t=x.merge(this.constructor(),e);return t.prevObject=this,t.context=this.context,t},each:function(e,t){return x.each(this,e,t)},ready:function(e){return x.ready.promise().done(e),this},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(e){var t=this.length,n=+e+(0>e?t:0);return this.pushStack(n>=0&&t>n?[this[n]]:[])},map:function(e){return this.pushStack(x.map(this,function(t,n){return e.call(t,n,t)}))},end:function(){return this.prevObject||this.constructor(null)},push:h,sort:[].sort,splice:[].splice},x.fn.init.prototype=x.fn,x.extend=x.fn.extend=function(){var e,t,n,r,i,o,s=arguments[0]||{},a=1,u=arguments.length,l=!1;for("boolean"==typeof s&&(l=s,s=arguments[1]||{},a=2),"object"==typeof s||x.isFunction(s)||(s={}),u===a&&(s=this,--a);u>a;a++)if(null!=(e=arguments[a]))for(t in e)n=s[t],r=e[t],s!==r&&(l&&r&&(x.isPlainObject(r)||(i=x.isArray(r)))?(i?(i=!1,o=n&&x.isArray(n)?n:[]):o=n&&x.isPlainObject(n)?n:{},s[t]=x.extend(l,o,r)):r!==undefined&&(s[t]=r));return s},x.extend({expando:"jQuery"+(p+Math.random()).replace(/\D/g,""),noConflict:function(t){return e.$===x&&(e.$=u),t&&e.jQuery===x&&(e.jQuery=a),x},isReady:!1,readyWait:1,holdReady:function(e){e?x.readyWait++:x.ready(!0)},ready:function(e){(e===!0?--x.readyWait:x.isReady)||(x.isReady=!0,e!==!0&&--x.readyWait>0||(n.resolveWith(o,[x]),x.fn.trigger&&x(o).trigger("ready").off("ready")))},isFunction:function(e){return"function"===x.type(e)},isArray:Array.isArray,isWindow:function(e){return null!=e&&e===e.window},isNumeric:function(e){return!isNaN(parseFloat(e))&&isFinite(e)},type:function(e){return null==e?e+"":"object"==typeof e||"function"==typeof e?l[m.call(e)]||"object":typeof e},isPlainObject:function(e){if("object"!==x.type(e)||e.nodeType||x.isWindow(e))return!1;try{if(e.constructor&&!y.call(e.constructor.prototype,"isPrototypeOf"))return!1}catch(t){return!1}return!0},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},error:function(e){throw Error(e)},parseHTML:function(e,t,n){if(!e||"string"!=typeof e)return null;"boolean"==typeof t&&(n=t,t=!1),t=t||o;var r=C.exec(e),i=!n&&[];return r?[t.createElement(r[1])]:(r=x.buildFragment([e],t,i),i&&x(i).remove(),x.merge([],r.childNodes))},parseJSON:JSON.parse,parseXML:function(e){var t,n;if(!e||"string"!=typeof e)return null;try{n=new DOMParser,t=n.parseFromString(e,"text/xml")}catch(r){t=undefined}return(!t||t.getElementsByTagName("parsererror").length)&&x.error("Invalid XML: "+e),t},noop:function(){},globalEval:function(e){var t,n=eval;e=x.trim(e),e&&(1===e.indexOf("use strict")?(t=o.createElement("script"),t.text=e,o.head.appendChild(t).parentNode.removeChild(t)):n(e))},camelCase:function(e){return e.replace(k,"ms-").replace(N,E)},nodeName:function(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()},each:function(e,t,n){var r,i=0,o=e.length,s=j(e);if(n){if(s){for(;o>i;i++)if(r=t.apply(e[i],n),r===!1)break}else for(i in e)if(r=t.apply(e[i],n),r===!1)break}else if(s){for(;o>i;i++)if(r=t.call(e[i],i,e[i]),r===!1)break}else for(i in e)if(r=t.call(e[i],i,e[i]),r===!1)break;return e},trim:function(e){return null==e?"":v.call(e)},makeArray:function(e,t){var n=t||[];return null!=e&&(j(Object(e))?x.merge(n,"string"==typeof e?[e]:e):h.call(n,e)),n},inArray:function(e,t,n){return null==t?-1:g.call(t,e,n)},merge:function(e,t){var n=t.length,r=e.length,i=0;if("number"==typeof n)for(;n>i;i++)e[r++]=t[i];else while(t[i]!==undefined)e[r++]=t[i++];return e.length=r,e},grep:function(e,t,n){var r,i=[],o=0,s=e.length;for(n=!!n;s>o;o++)r=!!t(e[o],o),n!==r&&i.push(e[o]);return i},map:function(e,t,n){var r,i=0,o=e.length,s=j(e),a=[];if(s)for(;o>i;i++)r=t(e[i],i,n),null!=r&&(a[a.length]=r);else for(i in e)r=t(e[i],i,n),null!=r&&(a[a.length]=r);return f.apply([],a)},guid:1,proxy:function(e,t){var n,r,i;return"string"==typeof t&&(n=e[t],t=e,e=n),x.isFunction(e)?(r=d.call(arguments,2),i=function(){return e.apply(t||this,r.concat(d.call(arguments)))},i.guid=e.guid=e.guid||x.guid++,i):undefined},access:function(e,t,n,r,i,o,s){var a=0,u=e.length,l=null==n;if("object"===x.type(n)){i=!0;for(a in n)x.access(e,t,a,n[a],!0,o,s)}else if(r!==undefined&&(i=!0,x.isFunction(r)||(s=!0),l&&(s?(t.call(e,r),t=null):(l=t,t=function(e,t,n){return l.call(x(e),n)})),t))for(;u>a;a++)t(e[a],n,s?r:r.call(e[a],a,t(e[a],n)));return i?e:l?t.call(e):u?t(e[0],n):o},now:Date.now,swap:function(e,t,n,r){var i,o,s={};for(o in t)s[o]=e.style[o],e.style[o]=t[o];i=n.apply(e,r||[]);for(o in t)e.style[o]=s[o];return i}}),x.ready.promise=function(t){return n||(n=x.Deferred(),"complete"===o.readyState?setTimeout(x.ready):(o.addEventListener("DOMContentLoaded",S,!1),e.addEventListener("load",S,!1))),n.promise(t)},x.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(e,t){l["[object "+t+"]"]=t.toLowerCase()});function j(e){var t=e.length,n=x.type(e);return x.isWindow(e)?!1:1===e.nodeType&&t?!0:"array"===n||"function"!==n&&(0===t||"number"==typeof t&&t>0&&t-1 in e)}t=x(o),function(e,undefined){var t,n,r,i,o,s,a,u,l,c,p,f,h,d,g,m,y,v="sizzle"+-new Date,b=e.document,w=0,T=0,C=at(),k=at(),N=at(),E=!1,S=function(){return 0},j=typeof undefined,D=1<<31,A={}.hasOwnProperty,L=[],H=L.pop,q=L.push,O=L.push,F=L.slice,P=L.indexOf||function(e){var t=0,n=this.length;for(;n>t;t++)if(this[t]===e)return t;return-1},R="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",M="[\\x20\\t\\r\\n\\f]",W="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",$=W.replace("w","w#"),B="\\["+M+"*("+W+")"+M+"*(?:([*^$|!~]?=)"+M+"*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|("+$+")|)|)"+M+"*\\]",I=":("+W+")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|"+B.replace(3,8)+")*)|.*)\\)|)",z=RegExp("^"+M+"+|((?:^|[^\\\\])(?:\\\\.)*)"+M+"+$","g"),_=RegExp("^"+M+"*,"+M+"*"),X=RegExp("^"+M+"*([>+~]|"+M+")"+M+"*"),U=RegExp(M+"*[+~]"),Y=RegExp("="+M+"*([^\\]'\"]*)"+M+"*\\]","g"),V=RegExp(I),G=RegExp("^"+$+"$"),J={ID:RegExp("^#("+W+")"),CLASS:RegExp("^\\.("+W+")"),TAG:RegExp("^("+W.replace("w","w*")+")"),ATTR:RegExp("^"+B),PSEUDO:RegExp("^"+I),CHILD:RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+M+"*(even|odd|(([+-]|)(\\d*)n|)"+M+"*(?:([+-]|)"+M+"*(\\d+)|))"+M+"*\\)|)","i"),bool:RegExp("^(?:"+R+")$","i"),needsContext:RegExp("^"+M+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+M+"*((?:-\\d)?\\d*)"+M+"*\\)|)(?=[^-]|$)","i")},Q=/^[^{]+\{\s*\[native \w/,K=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,Z=/^(?:input|select|textarea|button)$/i,et=/^h\d$/i,tt=/'|\\/g,nt=RegExp("\\\\([\\da-f]{1,6}"+M+"?|("+M+")|.)","ig"),rt=function(e,t,n){var r="0x"+t-65536;return r!==r||n?t:0>r?String.fromCharCode(r+65536):String.fromCharCode(55296|r>>10,56320|1023&r)};try{O.apply(L=F.call(b.childNodes),b.childNodes),L[b.childNodes.length].nodeType}catch(it){O={apply:L.length?function(e,t){q.apply(e,F.call(t))}:function(e,t){var n=e.length,r=0;while(e[n++]=t[r++]);e.length=n-1}}}function ot(e,t,r,i){var o,s,a,u,l,f,g,m,x,w;if((t?t.ownerDocument||t:b)!==p&&c(t),t=t||p,r=r||[],!e||"string"!=typeof e)return r;if(1!==(u=t.nodeType)&&9!==u)return[];if(h&&!i){if(o=K.exec(e))if(a=o[1]){if(9===u){if(s=t.getElementById(a),!s||!s.parentNode)return r;if(s.id===a)return r.push(s),r}else if(t.ownerDocument&&(s=t.ownerDocument.getElementById(a))&&y(t,s)&&s.id===a)return r.push(s),r}else{if(o[2])return O.apply(r,t.getElementsByTagName(e)),r;if((a=o[3])&&n.getElementsByClassName&&t.getElementsByClassName)return O.apply(r,t.getElementsByClassName(a)),r}if(n.qsa&&(!d||!d.test(e))){if(m=g=v,x=t,w=9===u&&e,1===u&&"object"!==t.nodeName.toLowerCase()){f=vt(e),(g=t.getAttribute("id"))?m=g.replace(tt,"\\$&"):t.setAttribute("id",m),m="[id='"+m+"'] ",l=f.length;while(l--)f[l]=m+xt(f[l]);x=U.test(e)&&t.parentNode||t,w=f.join(",")}if(w)try{return O.apply(r,x.querySelectorAll(w)),r}catch(T){}finally{g||t.removeAttribute("id")}}}return St(e.replace(z,"$1"),t,r,i)}function st(e){return Q.test(e+"")}function at(){var e=[];function t(n,r){return e.push(n+=" ")>i.cacheLength&&delete t[e.shift()],t[n]=r}return t}function ut(e){return e[v]=!0,e}function lt(e){var t=p.createElement("div");try{return!!e(t)}catch(n){return!1}finally{t.parentNode&&t.parentNode.removeChild(t),t=null}}function ct(e,t,n){e=e.split("|");var r,o=e.length,s=n?null:t;while(o--)(r=i.attrHandle[e[o]])&&r!==t||(i.attrHandle[e[o]]=s)}function pt(e,t){var n=e.getAttributeNode(t);return n&&n.specified?n.value:e[t]===!0?t.toLowerCase():null}function ft(e,t){return e.getAttribute(t,"type"===t.toLowerCase()?1:2)}function ht(e){return"input"===e.nodeName.toLowerCase()?e.defaultValue:undefined}function dt(e,t){var n=t&&e,r=n&&1===e.nodeType&&1===t.nodeType&&(~t.sourceIndex||D)-(~e.sourceIndex||D);if(r)return r;if(n)while(n=n.nextSibling)if(n===t)return-1;return e?1:-1}function gt(e){return function(t){var n=t.nodeName.toLowerCase();return"input"===n&&t.type===e}}function mt(e){return function(t){var n=t.nodeName.toLowerCase();return("input"===n||"button"===n)&&t.type===e}}function yt(e){return ut(function(t){return t=+t,ut(function(n,r){var i,o=e([],n.length,t),s=o.length;while(s--)n[i=o[s]]&&(n[i]=!(r[i]=n[i]))})})}s=ot.isXML=function(e){var t=e&&(e.ownerDocument||e).documentElement;return t?"HTML"!==t.nodeName:!1},n=ot.support={},c=ot.setDocument=function(e){var t=e?e.ownerDocument||e:b,r=t.parentWindow;return t!==p&&9===t.nodeType&&t.documentElement?(p=t,f=t.documentElement,h=!s(t),r&&r.frameElement&&r.attachEvent("onbeforeunload",function(){c()}),n.attributes=lt(function(e){return e.innerHTML="<a href='#'></a>",ct("type|href|height|width",ft,"#"===e.firstChild.getAttribute("href")),ct(R,pt,null==e.getAttribute("disabled")),e.className="i",!e.getAttribute("className")}),n.input=lt(function(e){return e.innerHTML="<input>",e.firstChild.setAttribute("value",""),""===e.firstChild.getAttribute("value")}),ct("value",ht,n.attributes&&n.input),n.getElementsByTagName=lt(function(e){return e.appendChild(t.createComment("")),!e.getElementsByTagName("*").length}),n.getElementsByClassName=lt(function(e){return e.innerHTML="<div class='a'></div><div class='a i'></div>",e.firstChild.className="i",2===e.getElementsByClassName("i").length}),n.getById=lt(function(e){return f.appendChild(e).id=v,!t.getElementsByName||!t.getElementsByName(v).length}),n.getById?(i.find.ID=function(e,t){if(typeof t.getElementById!==j&&h){var n=t.getElementById(e);return n&&n.parentNode?[n]:[]}},i.filter.ID=function(e){var t=e.replace(nt,rt);return function(e){return e.getAttribute("id")===t}}):(delete i.find.ID,i.filter.ID=function(e){var t=e.replace(nt,rt);return function(e){var n=typeof e.getAttributeNode!==j&&e.getAttributeNode("id");return n&&n.value===t}}),i.find.TAG=n.getElementsByTagName?function(e,t){return typeof t.getElementsByTagName!==j?t.getElementsByTagName(e):undefined}:function(e,t){var n,r=[],i=0,o=t.getElementsByTagName(e);if("*"===e){while(n=o[i++])1===n.nodeType&&r.push(n);return r}return o},i.find.CLASS=n.getElementsByClassName&&function(e,t){return typeof t.getElementsByClassName!==j&&h?t.getElementsByClassName(e):undefined},g=[],d=[],(n.qsa=st(t.querySelectorAll))&&(lt(function(e){e.innerHTML="<select><option selected=''></option></select>",e.querySelectorAll("[selected]").length||d.push("\\["+M+"*(?:value|"+R+")"),e.querySelectorAll(":checked").length||d.push(":checked")}),lt(function(e){var n=t.createElement("input");n.setAttribute("type","hidden"),e.appendChild(n).setAttribute("t",""),e.querySelectorAll("[t^='']").length&&d.push("[*^$]="+M+"*(?:''|\"\")"),e.querySelectorAll(":enabled").length||d.push(":enabled",":disabled"),e.querySelectorAll("*,:x"),d.push(",.*:")})),(n.matchesSelector=st(m=f.webkitMatchesSelector||f.mozMatchesSelector||f.oMatchesSelector||f.msMatchesSelector))&&lt(function(e){n.disconnectedMatch=m.call(e,"div"),m.call(e,"[s!='']:x"),g.push("!=",I)}),d=d.length&&RegExp(d.join("|")),g=g.length&&RegExp(g.join("|")),y=st(f.contains)||f.compareDocumentPosition?function(e,t){var n=9===e.nodeType?e.documentElement:e,r=t&&t.parentNode;return e===r||!(!r||1!==r.nodeType||!(n.contains?n.contains(r):e.compareDocumentPosition&&16&e.compareDocumentPosition(r)))}:function(e,t){if(t)while(t=t.parentNode)if(t===e)return!0;return!1},n.sortDetached=lt(function(e){return 1&e.compareDocumentPosition(t.createElement("div"))}),S=f.compareDocumentPosition?function(e,r){if(e===r)return E=!0,0;var i=r.compareDocumentPosition&&e.compareDocumentPosition&&e.compareDocumentPosition(r);return i?1&i||!n.sortDetached&&r.compareDocumentPosition(e)===i?e===t||y(b,e)?-1:r===t||y(b,r)?1:l?P.call(l,e)-P.call(l,r):0:4&i?-1:1:e.compareDocumentPosition?-1:1}:function(e,n){var r,i=0,o=e.parentNode,s=n.parentNode,a=[e],u=[n];if(e===n)return E=!0,0;if(!o||!s)return e===t?-1:n===t?1:o?-1:s?1:l?P.call(l,e)-P.call(l,n):0;if(o===s)return dt(e,n);r=e;while(r=r.parentNode)a.unshift(r);r=n;while(r=r.parentNode)u.unshift(r);while(a[i]===u[i])i++;return i?dt(a[i],u[i]):a[i]===b?-1:u[i]===b?1:0},t):p},ot.matches=function(e,t){return ot(e,null,null,t)},ot.matchesSelector=function(e,t){if((e.ownerDocument||e)!==p&&c(e),t=t.replace(Y,"='$1']"),!(!n.matchesSelector||!h||g&&g.test(t)||d&&d.test(t)))try{var r=m.call(e,t);if(r||n.disconnectedMatch||e.document&&11!==e.document.nodeType)return r}catch(i){}return ot(t,p,null,[e]).length>0},ot.contains=function(e,t){return(e.ownerDocument||e)!==p&&c(e),y(e,t)},ot.attr=function(e,t){(e.ownerDocument||e)!==p&&c(e);var r=i.attrHandle[t.toLowerCase()],o=r&&A.call(i.attrHandle,t.toLowerCase())?r(e,t,!h):undefined;return o===undefined?n.attributes||!h?e.getAttribute(t):(o=e.getAttributeNode(t))&&o.specified?o.value:null:o},ot.error=function(e){throw Error("Syntax error, unrecognized expression: "+e)},ot.uniqueSort=function(e){var t,r=[],i=0,o=0;if(E=!n.detectDuplicates,l=!n.sortStable&&e.slice(0),e.sort(S),E){while(t=e[o++])t===e[o]&&(i=r.push(o));while(i--)e.splice(r[i],1)}return e},o=ot.getText=function(e){var t,n="",r=0,i=e.nodeType;if(i){if(1===i||9===i||11===i){if("string"==typeof e.textContent)return e.textContent;for(e=e.firstChild;e;e=e.nextSibling)n+=o(e)}else if(3===i||4===i)return e.nodeValue}else for(;t=e[r];r++)n+=o(t);return n},i=ot.selectors={cacheLength:50,createPseudo:ut,match:J,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(nt,rt),e[3]=(e[4]||e[5]||"").replace(nt,rt),"~="===e[2]&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),"nth"===e[1].slice(0,3)?(e[3]||ot.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*("even"===e[3]||"odd"===e[3])),e[5]=+(e[7]+e[8]||"odd"===e[3])):e[3]&&ot.error(e[0]),e},PSEUDO:function(e){var t,n=!e[5]&&e[2];return J.CHILD.test(e[0])?null:(e[3]&&e[4]!==undefined?e[2]=e[4]:n&&V.test(n)&&(t=vt(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){var t=e.replace(nt,rt).toLowerCase();return"*"===e?function(){return!0}:function(e){return e.nodeName&&e.nodeName.toLowerCase()===t}},CLASS:function(e){var t=C[e+" "];return t||(t=RegExp("(^|"+M+")"+e+"("+M+"|$)"))&&C(e,function(e){return t.test("string"==typeof e.className&&e.className||typeof e.getAttribute!==j&&e.getAttribute("class")||"")})},ATTR:function(e,t,n){return function(r){var i=ot.attr(r,e);return null==i?"!="===t:t?(i+="","="===t?i===n:"!="===t?i!==n:"^="===t?n&&0===i.indexOf(n):"*="===t?n&&i.indexOf(n)>-1:"$="===t?n&&i.slice(-n.length)===n:"~="===t?(" "+i+" ").indexOf(n)>-1:"|="===t?i===n||i.slice(0,n.length+1)===n+"-":!1):!0}},CHILD:function(e,t,n,r,i){var o="nth"!==e.slice(0,3),s="last"!==e.slice(-4),a="of-type"===t;return 1===r&&0===i?function(e){return!!e.parentNode}:function(t,n,u){var l,c,p,f,h,d,g=o!==s?"nextSibling":"previousSibling",m=t.parentNode,y=a&&t.nodeName.toLowerCase(),x=!u&&!a;if(m){if(o){while(g){p=t;while(p=p[g])if(a?p.nodeName.toLowerCase()===y:1===p.nodeType)return!1;d=g="only"===e&&!d&&"nextSibling"}return!0}if(d=[s?m.firstChild:m.lastChild],s&&x){c=m[v]||(m[v]={}),l=c[e]||[],h=l[0]===w&&l[1],f=l[0]===w&&l[2],p=h&&m.childNodes[h];while(p=++h&&p&&p[g]||(f=h=0)||d.pop())if(1===p.nodeType&&++f&&p===t){c[e]=[w,h,f];break}}else if(x&&(l=(t[v]||(t[v]={}))[e])&&l[0]===w)f=l[1];else while(p=++h&&p&&p[g]||(f=h=0)||d.pop())if((a?p.nodeName.toLowerCase()===y:1===p.nodeType)&&++f&&(x&&((p[v]||(p[v]={}))[e]=[w,f]),p===t))break;return f-=i,f===r||0===f%r&&f/r>=0}}},PSEUDO:function(e,t){var n,r=i.pseudos[e]||i.setFilters[e.toLowerCase()]||ot.error("unsupported pseudo: "+e);return r[v]?r(t):r.length>1?(n=[e,e,"",t],i.setFilters.hasOwnProperty(e.toLowerCase())?ut(function(e,n){var i,o=r(e,t),s=o.length;while(s--)i=P.call(e,o[s]),e[i]=!(n[i]=o[s])}):function(e){return r(e,0,n)}):r}},pseudos:{not:ut(function(e){var t=[],n=[],r=a(e.replace(z,"$1"));return r[v]?ut(function(e,t,n,i){var o,s=r(e,null,i,[]),a=e.length;while(a--)(o=s[a])&&(e[a]=!(t[a]=o))}):function(e,i,o){return t[0]=e,r(t,null,o,n),!n.pop()}}),has:ut(function(e){return function(t){return ot(e,t).length>0}}),contains:ut(function(e){return function(t){return(t.textContent||t.innerText||o(t)).indexOf(e)>-1}}),lang:ut(function(e){return G.test(e||"")||ot.error("unsupported lang: "+e),e=e.replace(nt,rt).toLowerCase(),function(t){var n;do if(n=h?t.lang:t.getAttribute("xml:lang")||t.getAttribute("lang"))return n=n.toLowerCase(),n===e||0===n.indexOf(e+"-");while((t=t.parentNode)&&1===t.nodeType);return!1}}),target:function(t){var n=e.location&&e.location.hash;return n&&n.slice(1)===t.id},root:function(e){return e===f},focus:function(e){return e===p.activeElement&&(!p.hasFocus||p.hasFocus())&&!!(e.type||e.href||~e.tabIndex)},enabled:function(e){return e.disabled===!1},disabled:function(e){return e.disabled===!0},checked:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&!!e.checked||"option"===t&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,e.selected===!0},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeName>"@"||3===e.nodeType||4===e.nodeType)return!1;return!0},parent:function(e){return!i.pseudos.empty(e)},header:function(e){return et.test(e.nodeName)},input:function(e){return Z.test(e.nodeName)},button:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&"button"===e.type||"button"===t},text:function(e){var t;return"input"===e.nodeName.toLowerCase()&&"text"===e.type&&(null==(t=e.getAttribute("type"))||t.toLowerCase()===e.type)},first:yt(function(){return[0]}),last:yt(function(e,t){return[t-1]}),eq:yt(function(e,t,n){return[0>n?n+t:n]}),even:yt(function(e,t){var n=0;for(;t>n;n+=2)e.push(n);return e}),odd:yt(function(e,t){var n=1;for(;t>n;n+=2)e.push(n);return e}),lt:yt(function(e,t,n){var r=0>n?n+t:n;for(;--r>=0;)e.push(r);return e}),gt:yt(function(e,t,n){var r=0>n?n+t:n;for(;t>++r;)e.push(r);return e})}};for(t in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})i.pseudos[t]=gt(t);for(t in{submit:!0,reset:!0})i.pseudos[t]=mt(t);function vt(e,t){var n,r,o,s,a,u,l,c=k[e+" "];if(c)return t?0:c.slice(0);a=e,u=[],l=i.preFilter;while(a){(!n||(r=_.exec(a)))&&(r&&(a=a.slice(r[0].length)||a),u.push(o=[])),n=!1,(r=X.exec(a))&&(n=r.shift(),o.push({value:n,type:r[0].replace(z," ")}),a=a.slice(n.length));for(s in i.filter)!(r=J[s].exec(a))||l[s]&&!(r=l[s](r))||(n=r.shift(),o.push({value:n,type:s,matches:r}),a=a.slice(n.length));if(!n)break}return t?a.length:a?ot.error(e):k(e,u).slice(0)}function xt(e){var t=0,n=e.length,r="";for(;n>t;t++)r+=e[t].value;return r}function bt(e,t,n){var i=t.dir,o=n&&"parentNode"===i,s=T++;return t.first?function(t,n,r){while(t=t[i])if(1===t.nodeType||o)return e(t,n,r)}:function(t,n,a){var u,l,c,p=w+" "+s;if(a){while(t=t[i])if((1===t.nodeType||o)&&e(t,n,a))return!0}else while(t=t[i])if(1===t.nodeType||o)if(c=t[v]||(t[v]={}),(l=c[i])&&l[0]===p){if((u=l[1])===!0||u===r)return u===!0}else if(l=c[i]=[p],l[1]=e(t,n,a)||r,l[1]===!0)return!0}}function wt(e){return e.length>1?function(t,n,r){var i=e.length;while(i--)if(!e[i](t,n,r))return!1;return!0}:e[0]}function Tt(e,t,n,r,i){var o,s=[],a=0,u=e.length,l=null!=t;for(;u>a;a++)(o=e[a])&&(!n||n(o,r,i))&&(s.push(o),l&&t.push(a));return s}function Ct(e,t,n,r,i,o){return r&&!r[v]&&(r=Ct(r)),i&&!i[v]&&(i=Ct(i,o)),ut(function(o,s,a,u){var l,c,p,f=[],h=[],d=s.length,g=o||Et(t||"*",a.nodeType?[a]:a,[]),m=!e||!o&&t?g:Tt(g,f,e,a,u),y=n?i||(o?e:d||r)?[]:s:m;if(n&&n(m,y,a,u),r){l=Tt(y,h),r(l,[],a,u),c=l.length;while(c--)(p=l[c])&&(y[h[c]]=!(m[h[c]]=p))}if(o){if(i||e){if(i){l=[],c=y.length;while(c--)(p=y[c])&&l.push(m[c]=p);i(null,y=[],l,u)}c=y.length;while(c--)(p=y[c])&&(l=i?P.call(o,p):f[c])>-1&&(o[l]=!(s[l]=p))}}else y=Tt(y===s?y.splice(d,y.length):y),i?i(null,s,y,u):O.apply(s,y)})}function kt(e){var t,n,r,o=e.length,s=i.relative[e[0].type],a=s||i.relative[" "],l=s?1:0,c=bt(function(e){return e===t},a,!0),p=bt(function(e){return P.call(t,e)>-1},a,!0),f=[function(e,n,r){return!s&&(r||n!==u)||((t=n).nodeType?c(e,n,r):p(e,n,r))}];for(;o>l;l++)if(n=i.relative[e[l].type])f=[bt(wt(f),n)];else{if(n=i.filter[e[l].type].apply(null,e[l].matches),n[v]){for(r=++l;o>r;r++)if(i.relative[e[r].type])break;return Ct(l>1&&wt(f),l>1&&xt(e.slice(0,l-1).concat({value:" "===e[l-2].type?"*":""})).replace(z,"$1"),n,r>l&&kt(e.slice(l,r)),o>r&&kt(e=e.slice(r)),o>r&&xt(e))}f.push(n)}return wt(f)}function Nt(e,t){var n=0,o=t.length>0,s=e.length>0,a=function(a,l,c,f,h){var d,g,m,y=[],v=0,x="0",b=a&&[],T=null!=h,C=u,k=a||s&&i.find.TAG("*",h&&l.parentNode||l),N=w+=null==C?1:Math.random()||.1;for(T&&(u=l!==p&&l,r=n);null!=(d=k[x]);x++){if(s&&d){g=0;while(m=e[g++])if(m(d,l,c)){f.push(d);break}T&&(w=N,r=++n)}o&&((d=!m&&d)&&v--,a&&b.push(d))}if(v+=x,o&&x!==v){g=0;while(m=t[g++])m(b,y,l,c);if(a){if(v>0)while(x--)b[x]||y[x]||(y[x]=H.call(f));y=Tt(y)}O.apply(f,y),T&&!a&&y.length>0&&v+t.length>1&&ot.uniqueSort(f)}return T&&(w=N,u=C),b};return o?ut(a):a}a=ot.compile=function(e,t){var n,r=[],i=[],o=N[e+" "];if(!o){t||(t=vt(e)),n=t.length;while(n--)o=kt(t[n]),o[v]?r.push(o):i.push(o);o=N(e,Nt(i,r))}return o};function Et(e,t,n){var r=0,i=t.length;for(;i>r;r++)ot(e,t[r],n);return n}function St(e,t,r,o){var s,u,l,c,p,f=vt(e);if(!o&&1===f.length){if(u=f[0]=f[0].slice(0),u.length>2&&"ID"===(l=u[0]).type&&n.getById&&9===t.nodeType&&h&&i.relative[u[1].type]){if(t=(i.find.ID(l.matches[0].replace(nt,rt),t)||[])[0],!t)return r;e=e.slice(u.shift().value.length)}s=J.needsContext.test(e)?0:u.length;while(s--){if(l=u[s],i.relative[c=l.type])break;if((p=i.find[c])&&(o=p(l.matches[0].replace(nt,rt),U.test(u[0].type)&&t.parentNode||t))){if(u.splice(s,1),e=o.length&&xt(u),!e)return O.apply(r,o),r;break}}}return a(e,f)(o,t,!h,r,U.test(e)),r}i.pseudos.nth=i.pseudos.eq;function jt(){}jt.prototype=i.filters=i.pseudos,i.setFilters=new jt,n.sortStable=v.split("").sort(S).join("")===v,c(),[0,0].sort(S),n.detectDuplicates=E,x.find=ot,x.expr=ot.selectors,x.expr[":"]=x.expr.pseudos,x.unique=ot.uniqueSort,x.text=ot.getText,x.isXMLDoc=ot.isXML,x.contains=ot.contains}(e);var D={};function A(e){var t=D[e]={};return x.each(e.match(w)||[],function(e,n){t[n]=!0}),t}x.Callbacks=function(e){e="string"==typeof e?D[e]||A(e):x.extend({},e);var t,n,r,i,o,s,a=[],u=!e.once&&[],l=function(p){for(t=e.memory&&p,n=!0,s=i||0,i=0,o=a.length,r=!0;a&&o>s;s++)if(a[s].apply(p[0],p[1])===!1&&e.stopOnFalse){t=!1;break}r=!1,a&&(u?u.length&&l(u.shift()):t?a=[]:c.disable())},c={add:function(){if(a){var n=a.length;(function s(t){x.each(t,function(t,n){var r=x.type(n);"function"===r?e.unique&&c.has(n)||a.push(n):n&&n.length&&"string"!==r&&s(n)})})(arguments),r?o=a.length:t&&(i=n,l(t))}return this},remove:function(){return a&&x.each(arguments,function(e,t){var n;while((n=x.inArray(t,a,n))>-1)a.splice(n,1),r&&(o>=n&&o--,s>=n&&s--)}),this},has:function(e){return e?x.inArray(e,a)>-1:!(!a||!a.length)},empty:function(){return a=[],o=0,this},disable:function(){return a=u=t=undefined,this},disabled:function(){return!a},lock:function(){return u=undefined,t||c.disable(),this},locked:function(){return!u},fireWith:function(e,t){return t=t||[],t=[e,t.slice?t.slice():t],!a||n&&!u||(r?u.push(t):l(t)),this},fire:function(){return c.fireWith(this,arguments),this},fired:function(){return!!n}};return c},x.extend({Deferred:function(e){var t=[["resolve","done",x.Callbacks("once memory"),"resolved"],["reject","fail",x.Callbacks("once memory"),"rejected"],["notify","progress",x.Callbacks("memory")]],n="pending",r={state:function(){return n},always:function(){return i.done(arguments).fail(arguments),this},then:function(){var e=arguments;return x.Deferred(function(n){x.each(t,function(t,o){var s=o[0],a=x.isFunction(e[t])&&e[t];i[o[1]](function(){var e=a&&a.apply(this,arguments);e&&x.isFunction(e.promise)?e.promise().done(n.resolve).fail(n.reject).progress(n.notify):n[s+"With"](this===r?n.promise():this,a?[e]:arguments)})}),e=null}).promise()},promise:function(e){return null!=e?x.extend(e,r):r}},i={};return r.pipe=r.then,x.each(t,function(e,o){var s=o[2],a=o[3];r[o[1]]=s.add,a&&s.add(function(){n=a},t[1^e][2].disable,t[2][2].lock),i[o[0]]=function(){return i[o[0]+"With"](this===i?r:this,arguments),this},i[o[0]+"With"]=s.fireWith}),r.promise(i),e&&e.call(i,i),i},when:function(e){var t=0,n=d.call(arguments),r=n.length,i=1!==r||e&&x.isFunction(e.promise)?r:0,o=1===i?e:x.Deferred(),s=function(e,t,n){return function(r){t[e]=this,n[e]=arguments.length>1?d.call(arguments):r,n===a?o.notifyWith(t,n):--i||o.resolveWith(t,n)}},a,u,l;if(r>1)for(a=Array(r),u=Array(r),l=Array(r);r>t;t++)n[t]&&x.isFunction(n[t].promise)?n[t].promise().done(s(t,l,n)).fail(o.reject).progress(s(t,u,a)):--i;return i||o.resolveWith(l,n),o.promise()}}),x.support=function(t){var n=o.createElement("input"),r=o.createDocumentFragment(),i=o.createElement("div"),s=o.createElement("select"),a=s.appendChild(o.createElement("option"));return n.type?(n.type="checkbox",t.checkOn=""!==n.value,t.optSelected=a.selected,t.reliableMarginRight=!0,t.boxSizingReliable=!0,t.pixelPosition=!1,n.checked=!0,t.noCloneChecked=n.cloneNode(!0).checked,s.disabled=!0,t.optDisabled=!a.disabled,n=o.createElement("input"),n.value="t",n.type="radio",t.radioValue="t"===n.value,n.setAttribute("checked","t"),n.setAttribute("name","t"),r.appendChild(n),t.checkClone=r.cloneNode(!0).cloneNode(!0).lastChild.checked,t.focusinBubbles="onfocusin"in e,i.style.backgroundClip="content-box",i.cloneNode(!0).style.backgroundClip="",t.clearCloneStyle="content-box"===i.style.backgroundClip,x(function(){var n,r,s="padding:0;margin:0;border:0;display:block;-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box",a=o.getElementsByTagName("body")[0];a&&(n=o.createElement("div"),n.style.cssText="border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px",a.appendChild(n).appendChild(i),i.innerHTML="",i.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%",x.swap(a,null!=a.style.zoom?{zoom:1}:{},function(){t.boxSizing=4===i.offsetWidth}),e.getComputedStyle&&(t.pixelPosition="1%"!==(e.getComputedStyle(i,null)||{}).top,t.boxSizingReliable="4px"===(e.getComputedStyle(i,null)||{width:"4px"}).width,r=i.appendChild(o.createElement("div")),r.style.cssText=i.style.cssText=s,r.style.marginRight=r.style.width="0",i.style.width="1px",t.reliableMarginRight=!parseFloat((e.getComputedStyle(r,null)||{}).marginRight)),a.removeChild(n))}),t):t}({});var L,H,q=/(?:\{[\s\S]*\}|\[[\s\S]*\])$/,O=/([A-Z])/g;function F(){Object.defineProperty(this.cache={},0,{get:function(){return{}}}),this.expando=x.expando+Math.random()}F.uid=1,F.accepts=function(e){return e.nodeType?1===e.nodeType||9===e.nodeType:!0},F.prototype={key:function(e){if(!F.accepts(e))return 0;var t={},n=e[this.expando];if(!n){n=F.uid++;try{t[this.expando]={value:n},Object.defineProperties(e,t)}catch(r){t[this.expando]=n,x.extend(e,t)}}return this.cache[n]||(this.cache[n]={}),n},set:function(e,t,n){var r,i=this.key(e),o=this.cache[i];if("string"==typeof t)o[t]=n;else if(x.isEmptyObject(o))x.extend(this.cache[i],t);else for(r in t)o[r]=t[r];return o},get:function(e,t){var n=this.cache[this.key(e)];return t===undefined?n:n[t]},access:function(e,t,n){return t===undefined||t&&"string"==typeof t&&n===undefined?this.get(e,t):(this.set(e,t,n),n!==undefined?n:t)},remove:function(e,t){var n,r,i,o=this.key(e),s=this.cache[o];if(t===undefined)this.cache[o]={};else{x.isArray(t)?r=t.concat(t.map(x.camelCase)):(i=x.camelCase(t),t in s?r=[t,i]:(r=i,r=r in s?[r]:r.match(w)||[])),n=r.length;while(n--)delete s[r[n]]}},hasData:function(e){return!x.isEmptyObject(this.cache[e[this.expando]]||{})},discard:function(e){e[this.expando]&&delete this.cache[e[this.expando]]}},L=new F,H=new F,x.extend({acceptData:F.accepts,hasData:function(e){return L.hasData(e)||H.hasData(e)},data:function(e,t,n){return L.access(e,t,n)},removeData:function(e,t){L.remove(e,t)},_data:function(e,t,n){return H.access(e,t,n)},_removeData:function(e,t){H.remove(e,t)}}),x.fn.extend({data:function(e,t){var n,r,i=this[0],o=0,s=null;if(e===undefined){if(this.length&&(s=L.get(i),1===i.nodeType&&!H.get(i,"hasDataAttrs"))){for(n=i.attributes;n.length>o;o++)r=n[o].name,0===r.indexOf("data-")&&(r=x.camelCase(r.slice(5)),P(i,r,s[r]));H.set(i,"hasDataAttrs",!0)}return s}return"object"==typeof e?this.each(function(){L.set(this,e)}):x.access(this,function(t){var n,r=x.camelCase(e);if(i&&t===undefined){if(n=L.get(i,e),n!==undefined)return n;if(n=L.get(i,r),n!==undefined)return n;if(n=P(i,r,undefined),n!==undefined)return n}else this.each(function(){var n=L.get(this,r);L.set(this,r,t),-1!==e.indexOf("-")&&n!==undefined&&L.set(this,e,t)})},null,t,arguments.length>1,null,!0)},removeData:function(e){return this.each(function(){L.remove(this,e)})}});function P(e,t,n){var r;if(n===undefined&&1===e.nodeType)if(r="data-"+t.replace(O,"-$1").toLowerCase(),n=e.getAttribute(r),"string"==typeof n){try{n="true"===n?!0:"false"===n?!1:"null"===n?null:+n+""===n?+n:q.test(n)?JSON.parse(n):n}catch(i){}L.set(e,t,n)}else n=undefined;return n}x.extend({queue:function(e,t,n){var r;return e?(t=(t||"fx")+"queue",r=H.get(e,t),n&&(!r||x.isArray(n)?r=H.access(e,t,x.makeArray(n)):r.push(n)),r||[]):undefined},dequeue:function(e,t){t=t||"fx";var n=x.queue(e,t),r=n.length,i=n.shift(),o=x._queueHooks(e,t),s=function(){x.dequeue(e,t)};"inprogress"===i&&(i=n.shift(),r--),i&&("fx"===t&&n.unshift("inprogress"),delete o.stop,i.call(e,s,o)),!r&&o&&o.empty.fire()
},_queueHooks:function(e,t){var n=t+"queueHooks";return H.get(e,n)||H.access(e,n,{empty:x.Callbacks("once memory").add(function(){H.remove(e,[t+"queue",n])})})}}),x.fn.extend({queue:function(e,t){var n=2;return"string"!=typeof e&&(t=e,e="fx",n--),n>arguments.length?x.queue(this[0],e):t===undefined?this:this.each(function(){var n=x.queue(this,e,t);x._queueHooks(this,e),"fx"===e&&"inprogress"!==n[0]&&x.dequeue(this,e)})},dequeue:function(e){return this.each(function(){x.dequeue(this,e)})},delay:function(e,t){return e=x.fx?x.fx.speeds[e]||e:e,t=t||"fx",this.queue(t,function(t,n){var r=setTimeout(t,e);n.stop=function(){clearTimeout(r)}})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,t){var n,r=1,i=x.Deferred(),o=this,s=this.length,a=function(){--r||i.resolveWith(o,[o])};"string"!=typeof e&&(t=e,e=undefined),e=e||"fx";while(s--)n=H.get(o[s],e+"queueHooks"),n&&n.empty&&(r++,n.empty.add(a));return a(),i.promise(t)}});var R,M,W=/[\t\r\n\f]/g,$=/\r/g,B=/^(?:input|select|textarea|button)$/i;x.fn.extend({attr:function(e,t){return x.access(this,x.attr,e,t,arguments.length>1)},removeAttr:function(e){return this.each(function(){x.removeAttr(this,e)})},prop:function(e,t){return x.access(this,x.prop,e,t,arguments.length>1)},removeProp:function(e){return this.each(function(){delete this[x.propFix[e]||e]})},addClass:function(e){var t,n,r,i,o,s=0,a=this.length,u="string"==typeof e&&e;if(x.isFunction(e))return this.each(function(t){x(this).addClass(e.call(this,t,this.className))});if(u)for(t=(e||"").match(w)||[];a>s;s++)if(n=this[s],r=1===n.nodeType&&(n.className?(" "+n.className+" ").replace(W," "):" ")){o=0;while(i=t[o++])0>r.indexOf(" "+i+" ")&&(r+=i+" ");n.className=x.trim(r)}return this},removeClass:function(e){var t,n,r,i,o,s=0,a=this.length,u=0===arguments.length||"string"==typeof e&&e;if(x.isFunction(e))return this.each(function(t){x(this).removeClass(e.call(this,t,this.className))});if(u)for(t=(e||"").match(w)||[];a>s;s++)if(n=this[s],r=1===n.nodeType&&(n.className?(" "+n.className+" ").replace(W," "):"")){o=0;while(i=t[o++])while(r.indexOf(" "+i+" ")>=0)r=r.replace(" "+i+" "," ");n.className=e?x.trim(r):""}return this},toggleClass:function(e,t){var n=typeof e,i="boolean"==typeof t;return x.isFunction(e)?this.each(function(n){x(this).toggleClass(e.call(this,n,this.className,t),t)}):this.each(function(){if("string"===n){var o,s=0,a=x(this),u=t,l=e.match(w)||[];while(o=l[s++])u=i?u:!a.hasClass(o),a[u?"addClass":"removeClass"](o)}else(n===r||"boolean"===n)&&(this.className&&H.set(this,"__className__",this.className),this.className=this.className||e===!1?"":H.get(this,"__className__")||"")})},hasClass:function(e){var t=" "+e+" ",n=0,r=this.length;for(;r>n;n++)if(1===this[n].nodeType&&(" "+this[n].className+" ").replace(W," ").indexOf(t)>=0)return!0;return!1},val:function(e){var t,n,r,i=this[0];{if(arguments.length)return r=x.isFunction(e),this.each(function(n){var i;1===this.nodeType&&(i=r?e.call(this,n,x(this).val()):e,null==i?i="":"number"==typeof i?i+="":x.isArray(i)&&(i=x.map(i,function(e){return null==e?"":e+""})),t=x.valHooks[this.type]||x.valHooks[this.nodeName.toLowerCase()],t&&"set"in t&&t.set(this,i,"value")!==undefined||(this.value=i))});if(i)return t=x.valHooks[i.type]||x.valHooks[i.nodeName.toLowerCase()],t&&"get"in t&&(n=t.get(i,"value"))!==undefined?n:(n=i.value,"string"==typeof n?n.replace($,""):null==n?"":n)}}}),x.extend({valHooks:{option:{get:function(e){var t=e.attributes.value;return!t||t.specified?e.value:e.text}},select:{get:function(e){var t,n,r=e.options,i=e.selectedIndex,o="select-one"===e.type||0>i,s=o?null:[],a=o?i+1:r.length,u=0>i?a:o?i:0;for(;a>u;u++)if(n=r[u],!(!n.selected&&u!==i||(x.support.optDisabled?n.disabled:null!==n.getAttribute("disabled"))||n.parentNode.disabled&&x.nodeName(n.parentNode,"optgroup"))){if(t=x(n).val(),o)return t;s.push(t)}return s},set:function(e,t){var n,r,i=e.options,o=x.makeArray(t),s=i.length;while(s--)r=i[s],(r.selected=x.inArray(x(r).val(),o)>=0)&&(n=!0);return n||(e.selectedIndex=-1),o}}},attr:function(e,t,n){var i,o,s=e.nodeType;if(e&&3!==s&&8!==s&&2!==s)return typeof e.getAttribute===r?x.prop(e,t,n):(1===s&&x.isXMLDoc(e)||(t=t.toLowerCase(),i=x.attrHooks[t]||(x.expr.match.bool.test(t)?M:R)),n===undefined?i&&"get"in i&&null!==(o=i.get(e,t))?o:(o=x.find.attr(e,t),null==o?undefined:o):null!==n?i&&"set"in i&&(o=i.set(e,n,t))!==undefined?o:(e.setAttribute(t,n+""),n):(x.removeAttr(e,t),undefined))},removeAttr:function(e,t){var n,r,i=0,o=t&&t.match(w);if(o&&1===e.nodeType)while(n=o[i++])r=x.propFix[n]||n,x.expr.match.bool.test(n)&&(e[r]=!1),e.removeAttribute(n)},attrHooks:{type:{set:function(e,t){if(!x.support.radioValue&&"radio"===t&&x.nodeName(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}},propFix:{"for":"htmlFor","class":"className"},prop:function(e,t,n){var r,i,o,s=e.nodeType;if(e&&3!==s&&8!==s&&2!==s)return o=1!==s||!x.isXMLDoc(e),o&&(t=x.propFix[t]||t,i=x.propHooks[t]),n!==undefined?i&&"set"in i&&(r=i.set(e,n,t))!==undefined?r:e[t]=n:i&&"get"in i&&null!==(r=i.get(e,t))?r:e[t]},propHooks:{tabIndex:{get:function(e){return e.hasAttribute("tabindex")||B.test(e.nodeName)||e.href?e.tabIndex:-1}}}}),M={set:function(e,t,n){return t===!1?x.removeAttr(e,n):e.setAttribute(n,n),n}},x.each(x.expr.match.bool.source.match(/\w+/g),function(e,t){var n=x.expr.attrHandle[t]||x.find.attr;x.expr.attrHandle[t]=function(e,t,r){var i=x.expr.attrHandle[t],o=r?undefined:(x.expr.attrHandle[t]=undefined)!=n(e,t,r)?t.toLowerCase():null;return x.expr.attrHandle[t]=i,o}}),x.support.optSelected||(x.propHooks.selected={get:function(e){var t=e.parentNode;return t&&t.parentNode&&t.parentNode.selectedIndex,null}}),x.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){x.propFix[this.toLowerCase()]=this}),x.each(["radio","checkbox"],function(){x.valHooks[this]={set:function(e,t){return x.isArray(t)?e.checked=x.inArray(x(e).val(),t)>=0:undefined}},x.support.checkOn||(x.valHooks[this].get=function(e){return null===e.getAttribute("value")?"on":e.value})});var I=/^key/,z=/^(?:mouse|contextmenu)|click/,_=/^(?:focusinfocus|focusoutblur)$/,X=/^([^.]*)(?:\.(.+)|)$/;function U(){return!0}function Y(){return!1}function V(){try{return o.activeElement}catch(e){}}x.event={global:{},add:function(e,t,n,i,o){var s,a,u,l,c,p,f,h,d,g,m,y=H.get(e);if(y){n.handler&&(s=n,n=s.handler,o=s.selector),n.guid||(n.guid=x.guid++),(l=y.events)||(l=y.events={}),(a=y.handle)||(a=y.handle=function(e){return typeof x===r||e&&x.event.triggered===e.type?undefined:x.event.dispatch.apply(a.elem,arguments)},a.elem=e),t=(t||"").match(w)||[""],c=t.length;while(c--)u=X.exec(t[c])||[],d=m=u[1],g=(u[2]||"").split(".").sort(),d&&(f=x.event.special[d]||{},d=(o?f.delegateType:f.bindType)||d,f=x.event.special[d]||{},p=x.extend({type:d,origType:m,data:i,handler:n,guid:n.guid,selector:o,needsContext:o&&x.expr.match.needsContext.test(o),namespace:g.join(".")},s),(h=l[d])||(h=l[d]=[],h.delegateCount=0,f.setup&&f.setup.call(e,i,g,a)!==!1||e.addEventListener&&e.addEventListener(d,a,!1)),f.add&&(f.add.call(e,p),p.handler.guid||(p.handler.guid=n.guid)),o?h.splice(h.delegateCount++,0,p):h.push(p),x.event.global[d]=!0);e=null}},remove:function(e,t,n,r,i){var o,s,a,u,l,c,p,f,h,d,g,m=H.hasData(e)&&H.get(e);if(m&&(u=m.events)){t=(t||"").match(w)||[""],l=t.length;while(l--)if(a=X.exec(t[l])||[],h=g=a[1],d=(a[2]||"").split(".").sort(),h){p=x.event.special[h]||{},h=(r?p.delegateType:p.bindType)||h,f=u[h]||[],a=a[2]&&RegExp("(^|\\.)"+d.join("\\.(?:.*\\.|)")+"(\\.|$)"),s=o=f.length;while(o--)c=f[o],!i&&g!==c.origType||n&&n.guid!==c.guid||a&&!a.test(c.namespace)||r&&r!==c.selector&&("**"!==r||!c.selector)||(f.splice(o,1),c.selector&&f.delegateCount--,p.remove&&p.remove.call(e,c));s&&!f.length&&(p.teardown&&p.teardown.call(e,d,m.handle)!==!1||x.removeEvent(e,h,m.handle),delete u[h])}else for(h in u)x.event.remove(e,h+t[l],n,r,!0);x.isEmptyObject(u)&&(delete m.handle,H.remove(e,"events"))}},trigger:function(t,n,r,i){var s,a,u,l,c,p,f,h=[r||o],d=y.call(t,"type")?t.type:t,g=y.call(t,"namespace")?t.namespace.split("."):[];if(a=u=r=r||o,3!==r.nodeType&&8!==r.nodeType&&!_.test(d+x.event.triggered)&&(d.indexOf(".")>=0&&(g=d.split("."),d=g.shift(),g.sort()),c=0>d.indexOf(":")&&"on"+d,t=t[x.expando]?t:new x.Event(d,"object"==typeof t&&t),t.isTrigger=i?2:3,t.namespace=g.join("."),t.namespace_re=t.namespace?RegExp("(^|\\.)"+g.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,t.result=undefined,t.target||(t.target=r),n=null==n?[t]:x.makeArray(n,[t]),f=x.event.special[d]||{},i||!f.trigger||f.trigger.apply(r,n)!==!1)){if(!i&&!f.noBubble&&!x.isWindow(r)){for(l=f.delegateType||d,_.test(l+d)||(a=a.parentNode);a;a=a.parentNode)h.push(a),u=a;u===(r.ownerDocument||o)&&h.push(u.defaultView||u.parentWindow||e)}s=0;while((a=h[s++])&&!t.isPropagationStopped())t.type=s>1?l:f.bindType||d,p=(H.get(a,"events")||{})[t.type]&&H.get(a,"handle"),p&&p.apply(a,n),p=c&&a[c],p&&x.acceptData(a)&&p.apply&&p.apply(a,n)===!1&&t.preventDefault();return t.type=d,i||t.isDefaultPrevented()||f._default&&f._default.apply(h.pop(),n)!==!1||!x.acceptData(r)||c&&x.isFunction(r[d])&&!x.isWindow(r)&&(u=r[c],u&&(r[c]=null),x.event.triggered=d,r[d](),x.event.triggered=undefined,u&&(r[c]=u)),t.result}},dispatch:function(e){e=x.event.fix(e);var t,n,r,i,o,s=[],a=d.call(arguments),u=(H.get(this,"events")||{})[e.type]||[],l=x.event.special[e.type]||{};if(a[0]=e,e.delegateTarget=this,!l.preDispatch||l.preDispatch.call(this,e)!==!1){s=x.event.handlers.call(this,e,u),t=0;while((i=s[t++])&&!e.isPropagationStopped()){e.currentTarget=i.elem,n=0;while((o=i.handlers[n++])&&!e.isImmediatePropagationStopped())(!e.namespace_re||e.namespace_re.test(o.namespace))&&(e.handleObj=o,e.data=o.data,r=((x.event.special[o.origType]||{}).handle||o.handler).apply(i.elem,a),r!==undefined&&(e.result=r)===!1&&(e.preventDefault(),e.stopPropagation()))}return l.postDispatch&&l.postDispatch.call(this,e),e.result}},handlers:function(e,t){var n,r,i,o,s=[],a=t.delegateCount,u=e.target;if(a&&u.nodeType&&(!e.button||"click"!==e.type))for(;u!==this;u=u.parentNode||this)if(u.disabled!==!0||"click"!==e.type){for(r=[],n=0;a>n;n++)o=t[n],i=o.selector+" ",r[i]===undefined&&(r[i]=o.needsContext?x(i,this).index(u)>=0:x.find(i,this,null,[u]).length),r[i]&&r.push(o);r.length&&s.push({elem:u,handlers:r})}return t.length>a&&s.push({elem:this,handlers:t.slice(a)}),s},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(e,t){return null==e.which&&(e.which=null!=t.charCode?t.charCode:t.keyCode),e}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(e,t){var n,r,i,s=t.button;return null==e.pageX&&null!=t.clientX&&(n=e.target.ownerDocument||o,r=n.documentElement,i=n.body,e.pageX=t.clientX+(r&&r.scrollLeft||i&&i.scrollLeft||0)-(r&&r.clientLeft||i&&i.clientLeft||0),e.pageY=t.clientY+(r&&r.scrollTop||i&&i.scrollTop||0)-(r&&r.clientTop||i&&i.clientTop||0)),e.which||s===undefined||(e.which=1&s?1:2&s?3:4&s?2:0),e}},fix:function(e){if(e[x.expando])return e;var t,n,r,i=e.type,s=e,a=this.fixHooks[i];a||(this.fixHooks[i]=a=z.test(i)?this.mouseHooks:I.test(i)?this.keyHooks:{}),r=a.props?this.props.concat(a.props):this.props,e=new x.Event(s),t=r.length;while(t--)n=r[t],e[n]=s[n];return e.target||(e.target=o),3===e.target.nodeType&&(e.target=e.target.parentNode),a.filter?a.filter(e,s):e},special:{load:{noBubble:!0},focus:{trigger:function(){return this!==V()&&this.focus?(this.focus(),!1):undefined},delegateType:"focusin"},blur:{trigger:function(){return this===V()&&this.blur?(this.blur(),!1):undefined},delegateType:"focusout"},click:{trigger:function(){return"checkbox"===this.type&&this.click&&x.nodeName(this,"input")?(this.click(),!1):undefined},_default:function(e){return x.nodeName(e.target,"a")}},beforeunload:{postDispatch:function(e){e.result!==undefined&&(e.originalEvent.returnValue=e.result)}}},simulate:function(e,t,n,r){var i=x.extend(new x.Event,n,{type:e,isSimulated:!0,originalEvent:{}});r?x.event.trigger(i,null,t):x.event.dispatch.call(t,i),i.isDefaultPrevented()&&n.preventDefault()}},x.removeEvent=function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n,!1)},x.Event=function(e,t){return this instanceof x.Event?(e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||e.getPreventDefault&&e.getPreventDefault()?U:Y):this.type=e,t&&x.extend(this,t),this.timeStamp=e&&e.timeStamp||x.now(),this[x.expando]=!0,undefined):new x.Event(e,t)},x.Event.prototype={isDefaultPrevented:Y,isPropagationStopped:Y,isImmediatePropagationStopped:Y,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=U,e&&e.preventDefault&&e.preventDefault()},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=U,e&&e.stopPropagation&&e.stopPropagation()},stopImmediatePropagation:function(){this.isImmediatePropagationStopped=U,this.stopPropagation()}},x.each({mouseenter:"mouseover",mouseleave:"mouseout"},function(e,t){x.event.special[e]={delegateType:t,bindType:t,handle:function(e){var n,r=this,i=e.relatedTarget,o=e.handleObj;return(!i||i!==r&&!x.contains(r,i))&&(e.type=o.origType,n=o.handler.apply(this,arguments),e.type=t),n}}}),x.support.focusinBubbles||x.each({focus:"focusin",blur:"focusout"},function(e,t){var n=0,r=function(e){x.event.simulate(t,e.target,x.event.fix(e),!0)};x.event.special[t]={setup:function(){0===n++&&o.addEventListener(e,r,!0)},teardown:function(){0===--n&&o.removeEventListener(e,r,!0)}}}),x.fn.extend({on:function(e,t,n,r,i){var o,s;if("object"==typeof e){"string"!=typeof t&&(n=n||t,t=undefined);for(s in e)this.on(s,t,n,e[s],i);return this}if(null==n&&null==r?(r=t,n=t=undefined):null==r&&("string"==typeof t?(r=n,n=undefined):(r=n,n=t,t=undefined)),r===!1)r=Y;else if(!r)return this;return 1===i&&(o=r,r=function(e){return x().off(e),o.apply(this,arguments)},r.guid=o.guid||(o.guid=x.guid++)),this.each(function(){x.event.add(this,e,r,n,t)})},one:function(e,t,n,r){return this.on(e,t,n,r,1)},off:function(e,t,n){var r,i;if(e&&e.preventDefault&&e.handleObj)return r=e.handleObj,x(e.delegateTarget).off(r.namespace?r.origType+"."+r.namespace:r.origType,r.selector,r.handler),this;if("object"==typeof e){for(i in e)this.off(i,t,e[i]);return this}return(t===!1||"function"==typeof t)&&(n=t,t=undefined),n===!1&&(n=Y),this.each(function(){x.event.remove(this,e,n,t)})},trigger:function(e,t){return this.each(function(){x.event.trigger(e,t,this)})},triggerHandler:function(e,t){var n=this[0];return n?x.event.trigger(e,t,n,!0):undefined}});var G=/^.[^:#\[\.,]*$/,J=/^(?:parents|prev(?:Until|All))/,Q=x.expr.match.needsContext,K={children:!0,contents:!0,next:!0,prev:!0};x.fn.extend({find:function(e){var t,n=[],r=this,i=r.length;if("string"!=typeof e)return this.pushStack(x(e).filter(function(){for(t=0;i>t;t++)if(x.contains(r[t],this))return!0}));for(t=0;i>t;t++)x.find(e,r[t],n);return n=this.pushStack(i>1?x.unique(n):n),n.selector=this.selector?this.selector+" "+e:e,n},has:function(e){var t=x(e,this),n=t.length;return this.filter(function(){var e=0;for(;n>e;e++)if(x.contains(this,t[e]))return!0})},not:function(e){return this.pushStack(et(this,e||[],!0))},filter:function(e){return this.pushStack(et(this,e||[],!1))},is:function(e){return!!et(this,"string"==typeof e&&Q.test(e)?x(e):e||[],!1).length},closest:function(e,t){var n,r=0,i=this.length,o=[],s=Q.test(e)||"string"!=typeof e?x(e,t||this.context):0;for(;i>r;r++)for(n=this[r];n&&n!==t;n=n.parentNode)if(11>n.nodeType&&(s?s.index(n)>-1:1===n.nodeType&&x.find.matchesSelector(n,e))){n=o.push(n);break}return this.pushStack(o.length>1?x.unique(o):o)},index:function(e){return e?"string"==typeof e?g.call(x(e),this[0]):g.call(this,e.jquery?e[0]:e):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){var n="string"==typeof e?x(e,t):x.makeArray(e&&e.nodeType?[e]:e),r=x.merge(this.get(),n);return this.pushStack(x.unique(r))},addBack:function(e){return this.add(null==e?this.prevObject:this.prevObject.filter(e))}});function Z(e,t){while((e=e[t])&&1!==e.nodeType);return e}x.each({parent:function(e){var t=e.parentNode;return t&&11!==t.nodeType?t:null},parents:function(e){return x.dir(e,"parentNode")},parentsUntil:function(e,t,n){return x.dir(e,"parentNode",n)},next:function(e){return Z(e,"nextSibling")},prev:function(e){return Z(e,"previousSibling")},nextAll:function(e){return x.dir(e,"nextSibling")},prevAll:function(e){return x.dir(e,"previousSibling")},nextUntil:function(e,t,n){return x.dir(e,"nextSibling",n)},prevUntil:function(e,t,n){return x.dir(e,"previousSibling",n)},siblings:function(e){return x.sibling((e.parentNode||{}).firstChild,e)},children:function(e){return x.sibling(e.firstChild)},contents:function(e){return e.contentDocument||x.merge([],e.childNodes)}},function(e,t){x.fn[e]=function(n,r){var i=x.map(this,t,n);return"Until"!==e.slice(-5)&&(r=n),r&&"string"==typeof r&&(i=x.filter(r,i)),this.length>1&&(K[e]||x.unique(i),J.test(e)&&i.reverse()),this.pushStack(i)}}),x.extend({filter:function(e,t,n){var r=t[0];return n&&(e=":not("+e+")"),1===t.length&&1===r.nodeType?x.find.matchesSelector(r,e)?[r]:[]:x.find.matches(e,x.grep(t,function(e){return 1===e.nodeType}))},dir:function(e,t,n){var r=[],i=n!==undefined;while((e=e[t])&&9!==e.nodeType)if(1===e.nodeType){if(i&&x(e).is(n))break;r.push(e)}return r},sibling:function(e,t){var n=[];for(;e;e=e.nextSibling)1===e.nodeType&&e!==t&&n.push(e);return n}});function et(e,t,n){if(x.isFunction(t))return x.grep(e,function(e,r){return!!t.call(e,r,e)!==n});if(t.nodeType)return x.grep(e,function(e){return e===t!==n});if("string"==typeof t){if(G.test(t))return x.filter(t,e,n);t=x.filter(t,e)}return x.grep(e,function(e){return g.call(t,e)>=0!==n})}var tt=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,nt=/<([\w:]+)/,rt=/<|&#?\w+;/,it=/<(?:script|style|link)/i,ot=/^(?:checkbox|radio)$/i,st=/checked\s*(?:[^=]|=\s*.checked.)/i,at=/^$|\/(?:java|ecma)script/i,ut=/^true\/(.*)/,lt=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,ct={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};ct.optgroup=ct.option,ct.tbody=ct.tfoot=ct.colgroup=ct.caption=ct.thead,ct.th=ct.td,x.fn.extend({text:function(e){return x.access(this,function(e){return e===undefined?x.text(this):this.empty().append((this[0]&&this[0].ownerDocument||o).createTextNode(e))},null,e,arguments.length)},append:function(){return this.domManip(arguments,function(e){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var t=pt(this,e);t.appendChild(e)}})},prepend:function(){return this.domManip(arguments,function(e){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var t=pt(this,e);t.insertBefore(e,t.firstChild)}})},before:function(){return this.domManip(arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return this.domManip(arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},remove:function(e,t){var n,r=e?x.filter(e,this):this,i=0;for(;null!=(n=r[i]);i++)t||1!==n.nodeType||x.cleanData(mt(n)),n.parentNode&&(t&&x.contains(n.ownerDocument,n)&&dt(mt(n,"script")),n.parentNode.removeChild(n));return this},empty:function(){var e,t=0;for(;null!=(e=this[t]);t++)1===e.nodeType&&(x.cleanData(mt(e,!1)),e.textContent="");return this},clone:function(e,t){return e=null==e?!1:e,t=null==t?e:t,this.map(function(){return x.clone(this,e,t)})},html:function(e){return x.access(this,function(e){var t=this[0]||{},n=0,r=this.length;if(e===undefined&&1===t.nodeType)return t.innerHTML;if("string"==typeof e&&!it.test(e)&&!ct[(nt.exec(e)||["",""])[1].toLowerCase()]){e=e.replace(tt,"<$1></$2>");try{for(;r>n;n++)t=this[n]||{},1===t.nodeType&&(x.cleanData(mt(t,!1)),t.innerHTML=e);t=0}catch(i){}}t&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(){var e=x.map(this,function(e){return[e.nextSibling,e.parentNode]}),t=0;return this.domManip(arguments,function(n){var r=e[t++],i=e[t++];i&&(r&&r.parentNode!==i&&(r=this.nextSibling),x(this).remove(),i.insertBefore(n,r))},!0),t?this:this.remove()},detach:function(e){return this.remove(e,!0)},domManip:function(e,t,n){e=f.apply([],e);var r,i,o,s,a,u,l=0,c=this.length,p=this,h=c-1,d=e[0],g=x.isFunction(d);if(g||!(1>=c||"string"!=typeof d||x.support.checkClone)&&st.test(d))return this.each(function(r){var i=p.eq(r);g&&(e[0]=d.call(this,r,i.html())),i.domManip(e,t,n)});if(c&&(r=x.buildFragment(e,this[0].ownerDocument,!1,!n&&this),i=r.firstChild,1===r.childNodes.length&&(r=i),i)){for(o=x.map(mt(r,"script"),ft),s=o.length;c>l;l++)a=r,l!==h&&(a=x.clone(a,!0,!0),s&&x.merge(o,mt(a,"script"))),t.call(this[l],a,l);if(s)for(u=o[o.length-1].ownerDocument,x.map(o,ht),l=0;s>l;l++)a=o[l],at.test(a.type||"")&&!H.access(a,"globalEval")&&x.contains(u,a)&&(a.src?x._evalUrl(a.src):x.globalEval(a.textContent.replace(lt,"")))}return this}}),x.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,t){x.fn[e]=function(e){var n,r=[],i=x(e),o=i.length-1,s=0;for(;o>=s;s++)n=s===o?this:this.clone(!0),x(i[s])[t](n),h.apply(r,n.get());return this.pushStack(r)}}),x.extend({clone:function(e,t,n){var r,i,o,s,a=e.cloneNode(!0),u=x.contains(e.ownerDocument,e);if(!(x.support.noCloneChecked||1!==e.nodeType&&11!==e.nodeType||x.isXMLDoc(e)))for(s=mt(a),o=mt(e),r=0,i=o.length;i>r;r++)yt(o[r],s[r]);if(t)if(n)for(o=o||mt(e),s=s||mt(a),r=0,i=o.length;i>r;r++)gt(o[r],s[r]);else gt(e,a);return s=mt(a,"script"),s.length>0&&dt(s,!u&&mt(e,"script")),a},buildFragment:function(e,t,n,r){var i,o,s,a,u,l,c=0,p=e.length,f=t.createDocumentFragment(),h=[];for(;p>c;c++)if(i=e[c],i||0===i)if("object"===x.type(i))x.merge(h,i.nodeType?[i]:i);else if(rt.test(i)){o=o||f.appendChild(t.createElement("div")),s=(nt.exec(i)||["",""])[1].toLowerCase(),a=ct[s]||ct._default,o.innerHTML=a[1]+i.replace(tt,"<$1></$2>")+a[2],l=a[0];while(l--)o=o.firstChild;x.merge(h,o.childNodes),o=f.firstChild,o.textContent=""}else h.push(t.createTextNode(i));f.textContent="",c=0;while(i=h[c++])if((!r||-1===x.inArray(i,r))&&(u=x.contains(i.ownerDocument,i),o=mt(f.appendChild(i),"script"),u&&dt(o),n)){l=0;while(i=o[l++])at.test(i.type||"")&&n.push(i)}return f},cleanData:function(e){var t,n,r,i,o,s,a=x.event.special,u=0;for(;(n=e[u])!==undefined;u++){if(F.accepts(n)&&(o=n[H.expando],o&&(t=H.cache[o]))){if(r=Object.keys(t.events||{}),r.length)for(s=0;(i=r[s])!==undefined;s++)a[i]?x.event.remove(n,i):x.removeEvent(n,i,t.handle);H.cache[o]&&delete H.cache[o]}delete L.cache[n[L.expando]]}},_evalUrl:function(e){return x.ajax({url:e,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})}});function pt(e,t){return x.nodeName(e,"table")&&x.nodeName(1===t.nodeType?t:t.firstChild,"tr")?e.getElementsByTagName("tbody")[0]||e.appendChild(e.ownerDocument.createElement("tbody")):e}function ft(e){return e.type=(null!==e.getAttribute("type"))+"/"+e.type,e}function ht(e){var t=ut.exec(e.type);return t?e.type=t[1]:e.removeAttribute("type"),e}function dt(e,t){var n=e.length,r=0;for(;n>r;r++)H.set(e[r],"globalEval",!t||H.get(t[r],"globalEval"))}function gt(e,t){var n,r,i,o,s,a,u,l;if(1===t.nodeType){if(H.hasData(e)&&(o=H.access(e),s=H.set(t,o),l=o.events)){delete s.handle,s.events={};for(i in l)for(n=0,r=l[i].length;r>n;n++)x.event.add(t,i,l[i][n])}L.hasData(e)&&(a=L.access(e),u=x.extend({},a),L.set(t,u))}}function mt(e,t){var n=e.getElementsByTagName?e.getElementsByTagName(t||"*"):e.querySelectorAll?e.querySelectorAll(t||"*"):[];return t===undefined||t&&x.nodeName(e,t)?x.merge([e],n):n}function yt(e,t){var n=t.nodeName.toLowerCase();"input"===n&&ot.test(e.type)?t.checked=e.checked:("input"===n||"textarea"===n)&&(t.defaultValue=e.defaultValue)}x.fn.extend({wrapAll:function(e){var t;return x.isFunction(e)?this.each(function(t){x(this).wrapAll(e.call(this,t))}):(this[0]&&(t=x(e,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstElementChild)e=e.firstElementChild;return e}).append(this)),this)},wrapInner:function(e){return x.isFunction(e)?this.each(function(t){x(this).wrapInner(e.call(this,t))}):this.each(function(){var t=x(this),n=t.contents();n.length?n.wrapAll(e):t.append(e)})},wrap:function(e){var t=x.isFunction(e);return this.each(function(n){x(this).wrapAll(t?e.call(this,n):e)})},unwrap:function(){return this.parent().each(function(){x.nodeName(this,"body")||x(this).replaceWith(this.childNodes)}).end()}});var vt,xt,bt=/^(none|table(?!-c[ea]).+)/,wt=/^margin/,Tt=RegExp("^("+b+")(.*)$","i"),Ct=RegExp("^("+b+")(?!px)[a-z%]+$","i"),kt=RegExp("^([+-])=("+b+")","i"),Nt={BODY:"block"},Et={position:"absolute",visibility:"hidden",display:"block"},St={letterSpacing:0,fontWeight:400},jt=["Top","Right","Bottom","Left"],Dt=["Webkit","O","Moz","ms"];function At(e,t){if(t in e)return t;var n=t.charAt(0).toUpperCase()+t.slice(1),r=t,i=Dt.length;while(i--)if(t=Dt[i]+n,t in e)return t;return r}function Lt(e,t){return e=t||e,"none"===x.css(e,"display")||!x.contains(e.ownerDocument,e)}function Ht(t){return e.getComputedStyle(t,null)}function qt(e,t){var n,r,i,o=[],s=0,a=e.length;for(;a>s;s++)r=e[s],r.style&&(o[s]=H.get(r,"olddisplay"),n=r.style.display,t?(o[s]||"none"!==n||(r.style.display=""),""===r.style.display&&Lt(r)&&(o[s]=H.access(r,"olddisplay",Rt(r.nodeName)))):o[s]||(i=Lt(r),(n&&"none"!==n||!i)&&H.set(r,"olddisplay",i?n:x.css(r,"display"))));for(s=0;a>s;s++)r=e[s],r.style&&(t&&"none"!==r.style.display&&""!==r.style.display||(r.style.display=t?o[s]||"":"none"));return e}x.fn.extend({css:function(e,t){return x.access(this,function(e,t,n){var r,i,o={},s=0;if(x.isArray(t)){for(r=Ht(e),i=t.length;i>s;s++)o[t[s]]=x.css(e,t[s],!1,r);return o}return n!==undefined?x.style(e,t,n):x.css(e,t)},e,t,arguments.length>1)},show:function(){return qt(this,!0)},hide:function(){return qt(this)},toggle:function(e){var t="boolean"==typeof e;return this.each(function(){(t?e:Lt(this))?x(this).show():x(this).hide()})}}),x.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=vt(e,"opacity");return""===n?"1":n}}}},cssNumber:{columnCount:!0,fillOpacity:!0,fontWeight:!0,lineHeight:!0,opacity:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(e,t,n,r){if(e&&3!==e.nodeType&&8!==e.nodeType&&e.style){var i,o,s,a=x.camelCase(t),u=e.style;return t=x.cssProps[a]||(x.cssProps[a]=At(u,a)),s=x.cssHooks[t]||x.cssHooks[a],n===undefined?s&&"get"in s&&(i=s.get(e,!1,r))!==undefined?i:u[t]:(o=typeof n,"string"===o&&(i=kt.exec(n))&&(n=(i[1]+1)*i[2]+parseFloat(x.css(e,t)),o="number"),null==n||"number"===o&&isNaN(n)||("number"!==o||x.cssNumber[a]||(n+="px"),x.support.clearCloneStyle||""!==n||0!==t.indexOf("background")||(u[t]="inherit"),s&&"set"in s&&(n=s.set(e,n,r))===undefined||(u[t]=n)),undefined)}},css:function(e,t,n,r){var i,o,s,a=x.camelCase(t);return t=x.cssProps[a]||(x.cssProps[a]=At(e.style,a)),s=x.cssHooks[t]||x.cssHooks[a],s&&"get"in s&&(i=s.get(e,!0,n)),i===undefined&&(i=vt(e,t,r)),"normal"===i&&t in St&&(i=St[t]),""===n||n?(o=parseFloat(i),n===!0||x.isNumeric(o)?o||0:i):i}}),vt=function(e,t,n){var r,i,o,s=n||Ht(e),a=s?s.getPropertyValue(t)||s[t]:undefined,u=e.style;return s&&(""!==a||x.contains(e.ownerDocument,e)||(a=x.style(e,t)),Ct.test(a)&&wt.test(t)&&(r=u.width,i=u.minWidth,o=u.maxWidth,u.minWidth=u.maxWidth=u.width=a,a=s.width,u.width=r,u.minWidth=i,u.maxWidth=o)),a};function Ot(e,t,n){var r=Tt.exec(t);return r?Math.max(0,r[1]-(n||0))+(r[2]||"px"):t}function Ft(e,t,n,r,i){var o=n===(r?"border":"content")?4:"width"===t?1:0,s=0;for(;4>o;o+=2)"margin"===n&&(s+=x.css(e,n+jt[o],!0,i)),r?("content"===n&&(s-=x.css(e,"padding"+jt[o],!0,i)),"margin"!==n&&(s-=x.css(e,"border"+jt[o]+"Width",!0,i))):(s+=x.css(e,"padding"+jt[o],!0,i),"padding"!==n&&(s+=x.css(e,"border"+jt[o]+"Width",!0,i)));return s}function Pt(e,t,n){var r=!0,i="width"===t?e.offsetWidth:e.offsetHeight,o=Ht(e),s=x.support.boxSizing&&"border-box"===x.css(e,"boxSizing",!1,o);if(0>=i||null==i){if(i=vt(e,t,o),(0>i||null==i)&&(i=e.style[t]),Ct.test(i))return i;r=s&&(x.support.boxSizingReliable||i===e.style[t]),i=parseFloat(i)||0}return i+Ft(e,t,n||(s?"border":"content"),r,o)+"px"}function Rt(e){var t=o,n=Nt[e];return n||(n=Mt(e,t),"none"!==n&&n||(xt=(xt||x("<iframe frameborder='0' width='0' height='0'/>").css("cssText","display:block !important")).appendTo(t.documentElement),t=(xt[0].contentWindow||xt[0].contentDocument).document,t.write("<!doctype html><html><body>"),t.close(),n=Mt(e,t),xt.detach()),Nt[e]=n),n}function Mt(e,t){var n=x(t.createElement(e)).appendTo(t.body),r=x.css(n[0],"display");return n.remove(),r}x.each(["height","width"],function(e,t){x.cssHooks[t]={get:function(e,n,r){return n?0===e.offsetWidth&&bt.test(x.css(e,"display"))?x.swap(e,Et,function(){return Pt(e,t,r)}):Pt(e,t,r):undefined},set:function(e,n,r){var i=r&&Ht(e);return Ot(e,n,r?Ft(e,t,r,x.support.boxSizing&&"border-box"===x.css(e,"boxSizing",!1,i),i):0)}}}),x(function(){x.support.reliableMarginRight||(x.cssHooks.marginRight={get:function(e,t){return t?x.swap(e,{display:"inline-block"},vt,[e,"marginRight"]):undefined}}),!x.support.pixelPosition&&x.fn.position&&x.each(["top","left"],function(e,t){x.cssHooks[t]={get:function(e,n){return n?(n=vt(e,t),Ct.test(n)?x(e).position()[t]+"px":n):undefined}}})}),x.expr&&x.expr.filters&&(x.expr.filters.hidden=function(e){return 0>=e.offsetWidth&&0>=e.offsetHeight},x.expr.filters.visible=function(e){return!x.expr.filters.hidden(e)}),x.each({margin:"",padding:"",border:"Width"},function(e,t){x.cssHooks[e+t]={expand:function(n){var r=0,i={},o="string"==typeof n?n.split(" "):[n];for(;4>r;r++)i[e+jt[r]+t]=o[r]||o[r-2]||o[0];return i}},wt.test(e)||(x.cssHooks[e+t].set=Ot)});var Wt=/%20/g,$t=/\[\]$/,Bt=/\r?\n/g,It=/^(?:submit|button|image|reset|file)$/i,zt=/^(?:input|select|textarea|keygen)/i;x.fn.extend({serialize:function(){return x.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=x.prop(this,"elements");return e?x.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!x(this).is(":disabled")&&zt.test(this.nodeName)&&!It.test(e)&&(this.checked||!ot.test(e))}).map(function(e,t){var n=x(this).val();return null==n?null:x.isArray(n)?x.map(n,function(e){return{name:t.name,value:e.replace(Bt,"\r\n")}}):{name:t.name,value:n.replace(Bt,"\r\n")}}).get()}}),x.param=function(e,t){var n,r=[],i=function(e,t){t=x.isFunction(t)?t():null==t?"":t,r[r.length]=encodeURIComponent(e)+"="+encodeURIComponent(t)};if(t===undefined&&(t=x.ajaxSettings&&x.ajaxSettings.traditional),x.isArray(e)||e.jquery&&!x.isPlainObject(e))x.each(e,function(){i(this.name,this.value)});else for(n in e)_t(n,e[n],t,i);return r.join("&").replace(Wt,"+")};function _t(e,t,n,r){var i;if(x.isArray(t))x.each(t,function(t,i){n||$t.test(e)?r(e,i):_t(e+"["+("object"==typeof i?t:"")+"]",i,n,r)});else if(n||"object"!==x.type(t))r(e,t);else for(i in t)_t(e+"["+i+"]",t[i],n,r)}x.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(e,t){x.fn[t]=function(e,n){return arguments.length>0?this.on(t,null,e,n):this.trigger(t)}}),x.fn.extend({hover:function(e,t){return this.mouseenter(e).mouseleave(t||e)},bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return 1===arguments.length?this.off(e,"**"):this.off(t,e||"**",n)}});var Xt,Ut,Yt=x.now(),Vt=/\?/,Gt=/#.*$/,Jt=/([?&])_=[^&]*/,Qt=/^(.*?):[ \t]*([^\r\n]*)$/gm,Kt=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,Zt=/^(?:GET|HEAD)$/,en=/^\/\//,tn=/^([\w.+-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,nn=x.fn.load,rn={},on={},sn="*/".concat("*");
try{Ut=i.href}catch(an){Ut=o.createElement("a"),Ut.href="",Ut=Ut.href}Xt=tn.exec(Ut.toLowerCase())||[];function un(e){return function(t,n){"string"!=typeof t&&(n=t,t="*");var r,i=0,o=t.toLowerCase().match(w)||[];if(x.isFunction(n))while(r=o[i++])"+"===r[0]?(r=r.slice(1)||"*",(e[r]=e[r]||[]).unshift(n)):(e[r]=e[r]||[]).push(n)}}function ln(e,t,n,r){var i={},o=e===on;function s(a){var u;return i[a]=!0,x.each(e[a]||[],function(e,a){var l=a(t,n,r);return"string"!=typeof l||o||i[l]?o?!(u=l):undefined:(t.dataTypes.unshift(l),s(l),!1)}),u}return s(t.dataTypes[0])||!i["*"]&&s("*")}function cn(e,t){var n,r,i=x.ajaxSettings.flatOptions||{};for(n in t)t[n]!==undefined&&((i[n]?e:r||(r={}))[n]=t[n]);return r&&x.extend(!0,e,r),e}x.fn.load=function(e,t,n){if("string"!=typeof e&&nn)return nn.apply(this,arguments);var r,i,o,s=this,a=e.indexOf(" ");return a>=0&&(r=e.slice(a),e=e.slice(0,a)),x.isFunction(t)?(n=t,t=undefined):t&&"object"==typeof t&&(i="POST"),s.length>0&&x.ajax({url:e,type:i,dataType:"html",data:t}).done(function(e){o=arguments,s.html(r?x("<div>").append(x.parseHTML(e)).find(r):e)}).complete(n&&function(e,t){s.each(n,o||[e.responseText,t,e])}),this},x.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){x.fn[t]=function(e){return this.on(t,e)}}),x.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:Ut,type:"GET",isLocal:Kt.test(Xt[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":sn,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":x.parseJSON,"text xml":x.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?cn(cn(e,x.ajaxSettings),t):cn(x.ajaxSettings,e)},ajaxPrefilter:un(rn),ajaxTransport:un(on),ajax:function(e,t){"object"==typeof e&&(t=e,e=undefined),t=t||{};var n,r,i,o,s,a,u,l,c=x.ajaxSetup({},t),p=c.context||c,f=c.context&&(p.nodeType||p.jquery)?x(p):x.event,h=x.Deferred(),d=x.Callbacks("once memory"),g=c.statusCode||{},m={},y={},v=0,b="canceled",T={readyState:0,getResponseHeader:function(e){var t;if(2===v){if(!o){o={};while(t=Qt.exec(i))o[t[1].toLowerCase()]=t[2]}t=o[e.toLowerCase()]}return null==t?null:t},getAllResponseHeaders:function(){return 2===v?i:null},setRequestHeader:function(e,t){var n=e.toLowerCase();return v||(e=y[n]=y[n]||e,m[e]=t),this},overrideMimeType:function(e){return v||(c.mimeType=e),this},statusCode:function(e){var t;if(e)if(2>v)for(t in e)g[t]=[g[t],e[t]];else T.always(e[T.status]);return this},abort:function(e){var t=e||b;return n&&n.abort(t),k(0,t),this}};if(h.promise(T).complete=d.add,T.success=T.done,T.error=T.fail,c.url=((e||c.url||Ut)+"").replace(Gt,"").replace(en,Xt[1]+"//"),c.type=t.method||t.type||c.method||c.type,c.dataTypes=x.trim(c.dataType||"*").toLowerCase().match(w)||[""],null==c.crossDomain&&(a=tn.exec(c.url.toLowerCase()),c.crossDomain=!(!a||a[1]===Xt[1]&&a[2]===Xt[2]&&(a[3]||("http:"===a[1]?"80":"443"))===(Xt[3]||("http:"===Xt[1]?"80":"443")))),c.data&&c.processData&&"string"!=typeof c.data&&(c.data=x.param(c.data,c.traditional)),ln(rn,c,t,T),2===v)return T;u=c.global,u&&0===x.active++&&x.event.trigger("ajaxStart"),c.type=c.type.toUpperCase(),c.hasContent=!Zt.test(c.type),r=c.url,c.hasContent||(c.data&&(r=c.url+=(Vt.test(r)?"&":"?")+c.data,delete c.data),c.cache===!1&&(c.url=Jt.test(r)?r.replace(Jt,"$1_="+Yt++):r+(Vt.test(r)?"&":"?")+"_="+Yt++)),c.ifModified&&(x.lastModified[r]&&T.setRequestHeader("If-Modified-Since",x.lastModified[r]),x.etag[r]&&T.setRequestHeader("If-None-Match",x.etag[r])),(c.data&&c.hasContent&&c.contentType!==!1||t.contentType)&&T.setRequestHeader("Content-Type",c.contentType),T.setRequestHeader("Accept",c.dataTypes[0]&&c.accepts[c.dataTypes[0]]?c.accepts[c.dataTypes[0]]+("*"!==c.dataTypes[0]?", "+sn+"; q=0.01":""):c.accepts["*"]);for(l in c.headers)T.setRequestHeader(l,c.headers[l]);if(c.beforeSend&&(c.beforeSend.call(p,T,c)===!1||2===v))return T.abort();b="abort";for(l in{success:1,error:1,complete:1})T[l](c[l]);if(n=ln(on,c,t,T)){T.readyState=1,u&&f.trigger("ajaxSend",[T,c]),c.async&&c.timeout>0&&(s=setTimeout(function(){T.abort("timeout")},c.timeout));try{v=1,n.send(m,k)}catch(C){if(!(2>v))throw C;k(-1,C)}}else k(-1,"No Transport");function k(e,t,o,a){var l,m,y,b,w,C=t;2!==v&&(v=2,s&&clearTimeout(s),n=undefined,i=a||"",T.readyState=e>0?4:0,l=e>=200&&300>e||304===e,o&&(b=pn(c,T,o)),b=fn(c,b,T,l),l?(c.ifModified&&(w=T.getResponseHeader("Last-Modified"),w&&(x.lastModified[r]=w),w=T.getResponseHeader("etag"),w&&(x.etag[r]=w)),204===e||"HEAD"===c.type?C="nocontent":304===e?C="notmodified":(C=b.state,m=b.data,y=b.error,l=!y)):(y=C,(e||!C)&&(C="error",0>e&&(e=0))),T.status=e,T.statusText=(t||C)+"",l?h.resolveWith(p,[m,C,T]):h.rejectWith(p,[T,C,y]),T.statusCode(g),g=undefined,u&&f.trigger(l?"ajaxSuccess":"ajaxError",[T,c,l?m:y]),d.fireWith(p,[T,C]),u&&(f.trigger("ajaxComplete",[T,c]),--x.active||x.event.trigger("ajaxStop")))}return T},getJSON:function(e,t,n){return x.get(e,t,n,"json")},getScript:function(e,t){return x.get(e,undefined,t,"script")}}),x.each(["get","post"],function(e,t){x[t]=function(e,n,r,i){return x.isFunction(n)&&(i=i||r,r=n,n=undefined),x.ajax({url:e,type:t,dataType:i,data:n,success:r})}});function pn(e,t,n){var r,i,o,s,a=e.contents,u=e.dataTypes;while("*"===u[0])u.shift(),r===undefined&&(r=e.mimeType||t.getResponseHeader("Content-Type"));if(r)for(i in a)if(a[i]&&a[i].test(r)){u.unshift(i);break}if(u[0]in n)o=u[0];else{for(i in n){if(!u[0]||e.converters[i+" "+u[0]]){o=i;break}s||(s=i)}o=o||s}return o?(o!==u[0]&&u.unshift(o),n[o]):undefined}function fn(e,t,n,r){var i,o,s,a,u,l={},c=e.dataTypes.slice();if(c[1])for(s in e.converters)l[s.toLowerCase()]=e.converters[s];o=c.shift();while(o)if(e.responseFields[o]&&(n[e.responseFields[o]]=t),!u&&r&&e.dataFilter&&(t=e.dataFilter(t,e.dataType)),u=o,o=c.shift())if("*"===o)o=u;else if("*"!==u&&u!==o){if(s=l[u+" "+o]||l["* "+o],!s)for(i in l)if(a=i.split(" "),a[1]===o&&(s=l[u+" "+a[0]]||l["* "+a[0]])){s===!0?s=l[i]:l[i]!==!0&&(o=a[0],c.unshift(a[1]));break}if(s!==!0)if(s&&e["throws"])t=s(t);else try{t=s(t)}catch(p){return{state:"parsererror",error:s?p:"No conversion from "+u+" to "+o}}}return{state:"success",data:t}}x.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(e){return x.globalEval(e),e}}}),x.ajaxPrefilter("script",function(e){e.cache===undefined&&(e.cache=!1),e.crossDomain&&(e.type="GET")}),x.ajaxTransport("script",function(e){if(e.crossDomain){var t,n;return{send:function(r,i){t=x("<script>").prop({async:!0,charset:e.scriptCharset,src:e.url}).on("load error",n=function(e){t.remove(),n=null,e&&i("error"===e.type?404:200,e.type)}),o.head.appendChild(t[0])},abort:function(){n&&n()}}}});var hn=[],dn=/(=)\?(?=&|$)|\?\?/;x.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=hn.pop()||x.expando+"_"+Yt++;return this[e]=!0,e}}),x.ajaxPrefilter("json jsonp",function(t,n,r){var i,o,s,a=t.jsonp!==!1&&(dn.test(t.url)?"url":"string"==typeof t.data&&!(t.contentType||"").indexOf("application/x-www-form-urlencoded")&&dn.test(t.data)&&"data");return a||"jsonp"===t.dataTypes[0]?(i=t.jsonpCallback=x.isFunction(t.jsonpCallback)?t.jsonpCallback():t.jsonpCallback,a?t[a]=t[a].replace(dn,"$1"+i):t.jsonp!==!1&&(t.url+=(Vt.test(t.url)?"&":"?")+t.jsonp+"="+i),t.converters["script json"]=function(){return s||x.error(i+" was not called"),s[0]},t.dataTypes[0]="json",o=e[i],e[i]=function(){s=arguments},r.always(function(){e[i]=o,t[i]&&(t.jsonpCallback=n.jsonpCallback,hn.push(i)),s&&x.isFunction(o)&&o(s[0]),s=o=undefined}),"script"):undefined}),x.ajaxSettings.xhr=function(){try{return new XMLHttpRequest}catch(e){}};var gn=x.ajaxSettings.xhr(),mn={0:200,1223:204},yn=0,vn={};e.ActiveXObject&&x(e).on("unload",function(){for(var e in vn)vn[e]();vn=undefined}),x.support.cors=!!gn&&"withCredentials"in gn,x.support.ajax=gn=!!gn,x.ajaxTransport(function(e){var t;return x.support.cors||gn&&!e.crossDomain?{send:function(n,r){var i,o,s=e.xhr();if(s.open(e.type,e.url,e.async,e.username,e.password),e.xhrFields)for(i in e.xhrFields)s[i]=e.xhrFields[i];e.mimeType&&s.overrideMimeType&&s.overrideMimeType(e.mimeType),e.crossDomain||n["X-Requested-With"]||(n["X-Requested-With"]="XMLHttpRequest");for(i in n)s.setRequestHeader(i,n[i]);t=function(e){return function(){t&&(delete vn[o],t=s.onload=s.onerror=null,"abort"===e?s.abort():"error"===e?r(s.status||404,s.statusText):r(mn[s.status]||s.status,s.statusText,"string"==typeof s.responseText?{text:s.responseText}:undefined,s.getAllResponseHeaders()))}},s.onload=t(),s.onerror=t("error"),t=vn[o=yn++]=t("abort"),s.send(e.hasContent&&e.data||null)},abort:function(){t&&t()}}:undefined});var xn,bn,wn=/^(?:toggle|show|hide)$/,Tn=RegExp("^(?:([+-])=|)("+b+")([a-z%]*)$","i"),Cn=/queueHooks$/,kn=[An],Nn={"*":[function(e,t){var n=this.createTween(e,t),r=n.cur(),i=Tn.exec(t),o=i&&i[3]||(x.cssNumber[e]?"":"px"),s=(x.cssNumber[e]||"px"!==o&&+r)&&Tn.exec(x.css(n.elem,e)),a=1,u=20;if(s&&s[3]!==o){o=o||s[3],i=i||[],s=+r||1;do a=a||".5",s/=a,x.style(n.elem,e,s+o);while(a!==(a=n.cur()/r)&&1!==a&&--u)}return i&&(s=n.start=+s||+r||0,n.unit=o,n.end=i[1]?s+(i[1]+1)*i[2]:+i[2]),n}]};function En(){return setTimeout(function(){xn=undefined}),xn=x.now()}function Sn(e,t,n){var r,i=(Nn[t]||[]).concat(Nn["*"]),o=0,s=i.length;for(;s>o;o++)if(r=i[o].call(n,t,e))return r}function jn(e,t,n){var r,i,o=0,s=kn.length,a=x.Deferred().always(function(){delete u.elem}),u=function(){if(i)return!1;var t=xn||En(),n=Math.max(0,l.startTime+l.duration-t),r=n/l.duration||0,o=1-r,s=0,u=l.tweens.length;for(;u>s;s++)l.tweens[s].run(o);return a.notifyWith(e,[l,o,n]),1>o&&u?n:(a.resolveWith(e,[l]),!1)},l=a.promise({elem:e,props:x.extend({},t),opts:x.extend(!0,{specialEasing:{}},n),originalProperties:t,originalOptions:n,startTime:xn||En(),duration:n.duration,tweens:[],createTween:function(t,n){var r=x.Tween(e,l.opts,t,n,l.opts.specialEasing[t]||l.opts.easing);return l.tweens.push(r),r},stop:function(t){var n=0,r=t?l.tweens.length:0;if(i)return this;for(i=!0;r>n;n++)l.tweens[n].run(1);return t?a.resolveWith(e,[l,t]):a.rejectWith(e,[l,t]),this}}),c=l.props;for(Dn(c,l.opts.specialEasing);s>o;o++)if(r=kn[o].call(l,e,c,l.opts))return r;return x.map(c,Sn,l),x.isFunction(l.opts.start)&&l.opts.start.call(e,l),x.fx.timer(x.extend(u,{elem:e,anim:l,queue:l.opts.queue})),l.progress(l.opts.progress).done(l.opts.done,l.opts.complete).fail(l.opts.fail).always(l.opts.always)}function Dn(e,t){var n,r,i,o,s;for(n in e)if(r=x.camelCase(n),i=t[r],o=e[n],x.isArray(o)&&(i=o[1],o=e[n]=o[0]),n!==r&&(e[r]=o,delete e[n]),s=x.cssHooks[r],s&&"expand"in s){o=s.expand(o),delete e[r];for(n in o)n in e||(e[n]=o[n],t[n]=i)}else t[r]=i}x.Animation=x.extend(jn,{tweener:function(e,t){x.isFunction(e)?(t=e,e=["*"]):e=e.split(" ");var n,r=0,i=e.length;for(;i>r;r++)n=e[r],Nn[n]=Nn[n]||[],Nn[n].unshift(t)},prefilter:function(e,t){t?kn.unshift(e):kn.push(e)}});function An(e,t,n){var r,i,o,s,a,u,l=this,c={},p=e.style,f=e.nodeType&&Lt(e),h=H.get(e,"fxshow");n.queue||(a=x._queueHooks(e,"fx"),null==a.unqueued&&(a.unqueued=0,u=a.empty.fire,a.empty.fire=function(){a.unqueued||u()}),a.unqueued++,l.always(function(){l.always(function(){a.unqueued--,x.queue(e,"fx").length||a.empty.fire()})})),1===e.nodeType&&("height"in t||"width"in t)&&(n.overflow=[p.overflow,p.overflowX,p.overflowY],"inline"===x.css(e,"display")&&"none"===x.css(e,"float")&&(p.display="inline-block")),n.overflow&&(p.overflow="hidden",l.always(function(){p.overflow=n.overflow[0],p.overflowX=n.overflow[1],p.overflowY=n.overflow[2]}));for(r in t)if(i=t[r],wn.exec(i)){if(delete t[r],o=o||"toggle"===i,i===(f?"hide":"show")){if("show"!==i||!h||h[r]===undefined)continue;f=!0}c[r]=h&&h[r]||x.style(e,r)}if(!x.isEmptyObject(c)){h?"hidden"in h&&(f=h.hidden):h=H.access(e,"fxshow",{}),o&&(h.hidden=!f),f?x(e).show():l.done(function(){x(e).hide()}),l.done(function(){var t;H.remove(e,"fxshow");for(t in c)x.style(e,t,c[t])});for(r in c)s=Sn(f?h[r]:0,r,l),r in h||(h[r]=s.start,f&&(s.end=s.start,s.start="width"===r||"height"===r?1:0))}}function Ln(e,t,n,r,i){return new Ln.prototype.init(e,t,n,r,i)}x.Tween=Ln,Ln.prototype={constructor:Ln,init:function(e,t,n,r,i,o){this.elem=e,this.prop=n,this.easing=i||"swing",this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=o||(x.cssNumber[n]?"":"px")},cur:function(){var e=Ln.propHooks[this.prop];return e&&e.get?e.get(this):Ln.propHooks._default.get(this)},run:function(e){var t,n=Ln.propHooks[this.prop];return this.pos=t=this.options.duration?x.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):Ln.propHooks._default.set(this),this}},Ln.prototype.init.prototype=Ln.prototype,Ln.propHooks={_default:{get:function(e){var t;return null==e.elem[e.prop]||e.elem.style&&null!=e.elem.style[e.prop]?(t=x.css(e.elem,e.prop,""),t&&"auto"!==t?t:0):e.elem[e.prop]},set:function(e){x.fx.step[e.prop]?x.fx.step[e.prop](e):e.elem.style&&(null!=e.elem.style[x.cssProps[e.prop]]||x.cssHooks[e.prop])?x.style(e.elem,e.prop,e.now+e.unit):e.elem[e.prop]=e.now}}},Ln.propHooks.scrollTop=Ln.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},x.each(["toggle","show","hide"],function(e,t){var n=x.fn[t];x.fn[t]=function(e,r,i){return null==e||"boolean"==typeof e?n.apply(this,arguments):this.animate(Hn(t,!0),e,r,i)}}),x.fn.extend({fadeTo:function(e,t,n,r){return this.filter(Lt).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(e,t,n,r){var i=x.isEmptyObject(e),o=x.speed(t,n,r),s=function(){var t=jn(this,x.extend({},e),o);(i||H.get(this,"finish"))&&t.stop(!0)};return s.finish=s,i||o.queue===!1?this.each(s):this.queue(o.queue,s)},stop:function(e,t,n){var r=function(e){var t=e.stop;delete e.stop,t(n)};return"string"!=typeof e&&(n=t,t=e,e=undefined),t&&e!==!1&&this.queue(e||"fx",[]),this.each(function(){var t=!0,i=null!=e&&e+"queueHooks",o=x.timers,s=H.get(this);if(i)s[i]&&s[i].stop&&r(s[i]);else for(i in s)s[i]&&s[i].stop&&Cn.test(i)&&r(s[i]);for(i=o.length;i--;)o[i].elem!==this||null!=e&&o[i].queue!==e||(o[i].anim.stop(n),t=!1,o.splice(i,1));(t||!n)&&x.dequeue(this,e)})},finish:function(e){return e!==!1&&(e=e||"fx"),this.each(function(){var t,n=H.get(this),r=n[e+"queue"],i=n[e+"queueHooks"],o=x.timers,s=r?r.length:0;for(n.finish=!0,x.queue(this,e,[]),i&&i.stop&&i.stop.call(this,!0),t=o.length;t--;)o[t].elem===this&&o[t].queue===e&&(o[t].anim.stop(!0),o.splice(t,1));for(t=0;s>t;t++)r[t]&&r[t].finish&&r[t].finish.call(this);delete n.finish})}});function Hn(e,t){var n,r={height:e},i=0;for(t=t?1:0;4>i;i+=2-t)n=jt[i],r["margin"+n]=r["padding"+n]=e;return t&&(r.opacity=r.width=e),r}x.each({slideDown:Hn("show"),slideUp:Hn("hide"),slideToggle:Hn("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,t){x.fn[e]=function(e,n,r){return this.animate(t,e,n,r)}}),x.speed=function(e,t,n){var r=e&&"object"==typeof e?x.extend({},e):{complete:n||!n&&t||x.isFunction(e)&&e,duration:e,easing:n&&t||t&&!x.isFunction(t)&&t};return r.duration=x.fx.off?0:"number"==typeof r.duration?r.duration:r.duration in x.fx.speeds?x.fx.speeds[r.duration]:x.fx.speeds._default,(null==r.queue||r.queue===!0)&&(r.queue="fx"),r.old=r.complete,r.complete=function(){x.isFunction(r.old)&&r.old.call(this),r.queue&&x.dequeue(this,r.queue)},r},x.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2}},x.timers=[],x.fx=Ln.prototype.init,x.fx.tick=function(){var e,t=x.timers,n=0;for(xn=x.now();t.length>n;n++)e=t[n],e()||t[n]!==e||t.splice(n--,1);t.length||x.fx.stop(),xn=undefined},x.fx.timer=function(e){e()&&x.timers.push(e)&&x.fx.start()},x.fx.interval=13,x.fx.start=function(){bn||(bn=setInterval(x.fx.tick,x.fx.interval))},x.fx.stop=function(){clearInterval(bn),bn=null},x.fx.speeds={slow:600,fast:200,_default:400},x.fx.step={},x.expr&&x.expr.filters&&(x.expr.filters.animated=function(e){return x.grep(x.timers,function(t){return e===t.elem}).length}),x.fn.offset=function(e){if(arguments.length)return e===undefined?this:this.each(function(t){x.offset.setOffset(this,e,t)});var t,n,i=this[0],o={top:0,left:0},s=i&&i.ownerDocument;if(s)return t=s.documentElement,x.contains(t,i)?(typeof i.getBoundingClientRect!==r&&(o=i.getBoundingClientRect()),n=qn(s),{top:o.top+n.pageYOffset-t.clientTop,left:o.left+n.pageXOffset-t.clientLeft}):o},x.offset={setOffset:function(e,t,n){var r,i,o,s,a,u,l,c=x.css(e,"position"),p=x(e),f={};"static"===c&&(e.style.position="relative"),a=p.offset(),o=x.css(e,"top"),u=x.css(e,"left"),l=("absolute"===c||"fixed"===c)&&(o+u).indexOf("auto")>-1,l?(r=p.position(),s=r.top,i=r.left):(s=parseFloat(o)||0,i=parseFloat(u)||0),x.isFunction(t)&&(t=t.call(e,n,a)),null!=t.top&&(f.top=t.top-a.top+s),null!=t.left&&(f.left=t.left-a.left+i),"using"in t?t.using.call(e,f):p.css(f)}},x.fn.extend({position:function(){if(this[0]){var e,t,n=this[0],r={top:0,left:0};return"fixed"===x.css(n,"position")?t=n.getBoundingClientRect():(e=this.offsetParent(),t=this.offset(),x.nodeName(e[0],"html")||(r=e.offset()),r.top+=x.css(e[0],"borderTopWidth",!0),r.left+=x.css(e[0],"borderLeftWidth",!0)),{top:t.top-r.top-x.css(n,"marginTop",!0),left:t.left-r.left-x.css(n,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var e=this.offsetParent||s;while(e&&!x.nodeName(e,"html")&&"static"===x.css(e,"position"))e=e.offsetParent;return e||s})}}),x.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(t,n){var r="pageYOffset"===n;x.fn[t]=function(i){return x.access(this,function(t,i,o){var s=qn(t);return o===undefined?s?s[n]:t[i]:(s?s.scrollTo(r?e.pageXOffset:o,r?o:e.pageYOffset):t[i]=o,undefined)},t,i,arguments.length,null)}});function qn(e){return x.isWindow(e)?e:9===e.nodeType&&e.defaultView}x.each({Height:"height",Width:"width"},function(e,t){x.each({padding:"inner"+e,content:t,"":"outer"+e},function(n,r){x.fn[r]=function(r,i){var o=arguments.length&&(n||"boolean"!=typeof r),s=n||(r===!0||i===!0?"margin":"border");return x.access(this,function(t,n,r){var i;return x.isWindow(t)?t.document.documentElement["client"+e]:9===t.nodeType?(i=t.documentElement,Math.max(t.body["scroll"+e],i["scroll"+e],t.body["offset"+e],i["offset"+e],i["client"+e])):r===undefined?x.css(t,n,s):x.style(t,n,r,s)},t,o?r:undefined,o,null)}})}),x.fn.size=function(){return this.length},x.fn.andSelf=x.fn.addBack,"object"==typeof module&&module&&"object"==typeof module.exports?module.exports=x:"function"==typeof define&&define.amd&&define("jquery",[],function(){return x}),"object"==typeof e&&"object"==typeof e.document&&(e.jQuery=e.$=x)})(window);

/*! jQuery v2.1.3 | (c) 2005, 2014 jQuery Foundation, Inc. | jquery.org/license */
!function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=c.slice,e=c.concat,f=c.push,g=c.indexOf,h={},i=h.toString,j=h.hasOwnProperty,k={},l=a.document,m="2.1.3",n=function(a,b){return new n.fn.init(a,b)},o=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,p=/^-ms-/,q=/-([\da-z])/gi,r=function(a,b){return b.toUpperCase()};n.fn=n.prototype={jquery:m,constructor:n,selector:"",length:0,toArray:function(){return d.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:d.call(this)},pushStack:function(a){var b=n.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a,b){return n.each(this,a,b)},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:f,sort:c.sort,splice:c.splice},n.extend=n.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||n.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(a=arguments[h]))for(b in a)c=g[b],d=a[b],g!==d&&(j&&d&&(n.isPlainObject(d)||(e=n.isArray(d)))?(e?(e=!1,f=c&&n.isArray(c)?c:[]):f=c&&n.isPlainObject(c)?c:{},g[b]=n.extend(j,f,d)):void 0!==d&&(g[b]=d));return g},n.extend({expando:"jQuery"+(m+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray,isWindow:function(a){return null!=a&&a===a.window},isNumeric:function(a){return!n.isArray(a)&&a-parseFloat(a)+1>=0},isPlainObject:function(a){return"object"!==n.type(a)||a.nodeType||n.isWindow(a)?!1:a.constructor&&!j.call(a.constructor.prototype,"isPrototypeOf")?!1:!0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?h[i.call(a)]||"object":typeof a},globalEval:function(a){var b,c=eval;a=n.trim(a),a&&(1===a.indexOf("use strict")?(b=l.createElement("script"),b.text=a,l.head.appendChild(b).parentNode.removeChild(b)):c(a))},camelCase:function(a){return a.replace(p,"ms-").replace(q,r)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b,c){var d,e=0,f=a.length,g=s(a);if(c){if(g){for(;f>e;e++)if(d=b.apply(a[e],c),d===!1)break}else for(e in a)if(d=b.apply(a[e],c),d===!1)break}else if(g){for(;f>e;e++)if(d=b.call(a[e],e,a[e]),d===!1)break}else for(e in a)if(d=b.call(a[e],e,a[e]),d===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(o,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(s(Object(a))?n.merge(c,"string"==typeof a?[a]:a):f.call(c,a)),c},inArray:function(a,b,c){return null==b?-1:g.call(b,a,c)},merge:function(a,b){for(var c=+b.length,d=0,e=a.length;c>d;d++)a[e++]=b[d];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,f=0,g=a.length,h=s(a),i=[];if(h)for(;g>f;f++)d=b(a[f],f,c),null!=d&&i.push(d);else for(f in a)d=b(a[f],f,c),null!=d&&i.push(d);return e.apply([],i)},guid:1,proxy:function(a,b){var c,e,f;return"string"==typeof b&&(c=a[b],b=a,a=c),n.isFunction(a)?(e=d.call(arguments,2),f=function(){return a.apply(b||this,e.concat(d.call(arguments)))},f.guid=a.guid=a.guid||n.guid++,f):void 0},now:Date.now,support:k}),n.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(a,b){h["[object "+b+"]"]=b.toLowerCase()});function s(a){var b=a.length,c=n.type(a);return"function"===c||n.isWindow(a)?!1:1===a.nodeType&&b?!0:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var t=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=hb(),z=hb(),A=hb(),B=function(a,b){return a===b&&(l=!0),0},C=1<<31,D={}.hasOwnProperty,E=[],F=E.pop,G=E.push,H=E.push,I=E.slice,J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",L="[\\x20\\t\\r\\n\\f]",M="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",N=M.replace("w","w#"),O="\\["+L+"*("+M+")(?:"+L+"*([*^$|!~]?=)"+L+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+N+"))|)"+L+"*\\]",P=":("+M+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+O+")*)|.*)\\)|)",Q=new RegExp(L+"+","g"),R=new RegExp("^"+L+"+|((?:^|[^\\\\])(?:\\\\.)*)"+L+"+$","g"),S=new RegExp("^"+L+"*,"+L+"*"),T=new RegExp("^"+L+"*([>+~]|"+L+")"+L+"*"),U=new RegExp("="+L+"*([^\\]'\"]*?)"+L+"*\\]","g"),V=new RegExp(P),W=new RegExp("^"+N+"$"),X={ID:new RegExp("^#("+M+")"),CLASS:new RegExp("^\\.("+M+")"),TAG:new RegExp("^("+M.replace("w","w*")+")"),ATTR:new RegExp("^"+O),PSEUDO:new RegExp("^"+P),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+L+"*(even|odd|(([+-]|)(\\d*)n|)"+L+"*(?:([+-]|)"+L+"*(\\d+)|))"+L+"*\\)|)","i"),bool:new RegExp("^(?:"+K+")$","i"),needsContext:new RegExp("^"+L+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+L+"*((?:-\\d)?\\d*)"+L+"*\\)|)(?=[^-]|$)","i")},Y=/^(?:input|select|textarea|button)$/i,Z=/^h\d$/i,$=/^[^{]+\{\s*\[native \w/,_=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,ab=/[+~]/,bb=/'|\\/g,cb=new RegExp("\\\\([\\da-f]{1,6}"+L+"?|("+L+")|.)","ig"),db=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},eb=function(){m()};try{H.apply(E=I.call(v.childNodes),v.childNodes),E[v.childNodes.length].nodeType}catch(fb){H={apply:E.length?function(a,b){G.apply(a,I.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function gb(a,b,d,e){var f,h,j,k,l,o,r,s,w,x;if((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,d=d||[],k=b.nodeType,"string"!=typeof a||!a||1!==k&&9!==k&&11!==k)return d;if(!e&&p){if(11!==k&&(f=_.exec(a)))if(j=f[1]){if(9===k){if(h=b.getElementById(j),!h||!h.parentNode)return d;if(h.id===j)return d.push(h),d}else if(b.ownerDocument&&(h=b.ownerDocument.getElementById(j))&&t(b,h)&&h.id===j)return d.push(h),d}else{if(f[2])return H.apply(d,b.getElementsByTagName(a)),d;if((j=f[3])&&c.getElementsByClassName)return H.apply(d,b.getElementsByClassName(j)),d}if(c.qsa&&(!q||!q.test(a))){if(s=r=u,w=b,x=1!==k&&a,1===k&&"object"!==b.nodeName.toLowerCase()){o=g(a),(r=b.getAttribute("id"))?s=r.replace(bb,"\\$&"):b.setAttribute("id",s),s="[id='"+s+"'] ",l=o.length;while(l--)o[l]=s+rb(o[l]);w=ab.test(a)&&pb(b.parentNode)||b,x=o.join(",")}if(x)try{return H.apply(d,w.querySelectorAll(x)),d}catch(y){}finally{r||b.removeAttribute("id")}}}return i(a.replace(R,"$1"),b,d,e)}function hb(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ib(a){return a[u]=!0,a}function jb(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function kb(a,b){var c=a.split("|"),e=a.length;while(e--)d.attrHandle[c[e]]=b}function lb(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||C)-(~a.sourceIndex||C);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function mb(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function nb(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function ob(a){return ib(function(b){return b=+b,ib(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function pb(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=gb.support={},f=gb.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=gb.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=g.documentElement,e=g.defaultView,e&&e!==e.top&&(e.addEventListener?e.addEventListener("unload",eb,!1):e.attachEvent&&e.attachEvent("onunload",eb)),p=!f(g),c.attributes=jb(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=jb(function(a){return a.appendChild(g.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=$.test(g.getElementsByClassName),c.getById=jb(function(a){return o.appendChild(a).id=u,!g.getElementsByName||!g.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c&&c.parentNode?[c]:[]}},d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=$.test(g.querySelectorAll))&&(jb(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\f]' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+L+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+L+"*(?:value|"+K+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),jb(function(a){var b=g.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+L+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=$.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&jb(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",P)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=$.test(o.compareDocumentPosition),t=b||$.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===g||a.ownerDocument===v&&t(v,a)?-1:b===g||b.ownerDocument===v&&t(v,b)?1:k?J(k,a)-J(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,h=[a],i=[b];if(!e||!f)return a===g?-1:b===g?1:e?-1:f?1:k?J(k,a)-J(k,b):0;if(e===f)return lb(a,b);c=a;while(c=c.parentNode)h.unshift(c);c=b;while(c=c.parentNode)i.unshift(c);while(h[d]===i[d])d++;return d?lb(h[d],i[d]):h[d]===v?-1:i[d]===v?1:0},g):n},gb.matches=function(a,b){return gb(a,null,null,b)},gb.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(U,"='$1']"),!(!c.matchesSelector||!p||r&&r.test(b)||q&&q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return gb(b,n,null,[a]).length>0},gb.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},gb.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&D.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},gb.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},gb.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=gb.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=gb.selectors={cacheLength:50,createPseudo:ib,match:X,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(cb,db),a[3]=(a[3]||a[4]||a[5]||"").replace(cb,db),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||gb.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&gb.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return X.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&V.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(cb,db).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+L+")"+a+"("+L+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=gb.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(Q," ")+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h;if(q){if(f){while(p){l=b;while(l=l[p])if(h?l.nodeName.toLowerCase()===r:1===l.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){k=q[u]||(q[u]={}),j=k[a]||[],n=j[0]===w&&j[1],m=j[0]===w&&j[2],l=n&&q.childNodes[n];while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if(1===l.nodeType&&++m&&l===b){k[a]=[w,n,m];break}}else if(s&&(j=(b[u]||(b[u]={}))[a])&&j[0]===w)m=j[1];else while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if((h?l.nodeName.toLowerCase()===r:1===l.nodeType)&&++m&&(s&&((l[u]||(l[u]={}))[a]=[w,m]),l===b))break;return m-=e,m===d||m%d===0&&m/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||gb.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ib(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=J(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ib(function(a){var b=[],c=[],d=h(a.replace(R,"$1"));return d[u]?ib(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ib(function(a){return function(b){return gb(a,b).length>0}}),contains:ib(function(a){return a=a.replace(cb,db),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ib(function(a){return W.test(a||"")||gb.error("unsupported lang: "+a),a=a.replace(cb,db).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Z.test(a.nodeName)},input:function(a){return Y.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:ob(function(){return[0]}),last:ob(function(a,b){return[b-1]}),eq:ob(function(a,b,c){return[0>c?c+b:c]}),even:ob(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:ob(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:ob(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:ob(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=mb(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=nb(b);function qb(){}qb.prototype=d.filters=d.pseudos,d.setFilters=new qb,g=gb.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){(!c||(e=S.exec(h)))&&(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=T.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(R," ")}),h=h.slice(c.length));for(g in d.filter)!(e=X[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?gb.error(a):z(a,i).slice(0)};function rb(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function sb(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(i=b[u]||(b[u]={}),(h=i[d])&&h[0]===w&&h[1]===f)return j[2]=h[2];if(i[d]=j,j[2]=a(b,c,g))return!0}}}function tb(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function ub(a,b,c){for(var d=0,e=b.length;e>d;d++)gb(a,b[d],c);return c}function vb(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(!c||c(f,d,e))&&(g.push(f),j&&b.push(h));return g}function wb(a,b,c,d,e,f){return d&&!d[u]&&(d=wb(d)),e&&!e[u]&&(e=wb(e,f)),ib(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||ub(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:vb(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=vb(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?J(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=vb(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):H.apply(g,r)})}function xb(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=sb(function(a){return a===b},h,!0),l=sb(function(a){return J(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];f>i;i++)if(c=d.relative[a[i].type])m=[sb(tb(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return wb(i>1&&tb(m),i>1&&rb(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(R,"$1"),c,e>i&&xb(a.slice(i,e)),f>e&&xb(a=a.slice(e)),f>e&&rb(a))}m.push(c)}return tb(m)}function yb(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,m,o,p=0,q="0",r=f&&[],s=[],t=j,u=f||e&&d.find.TAG("*",k),v=w+=null==t?1:Math.random()||.1,x=u.length;for(k&&(j=g!==n&&g);q!==x&&null!=(l=u[q]);q++){if(e&&l){m=0;while(o=a[m++])if(o(l,g,h)){i.push(l);break}k&&(w=v)}c&&((l=!o&&l)&&p--,f&&r.push(l))}if(p+=q,c&&q!==p){m=0;while(o=b[m++])o(r,s,g,h);if(f){if(p>0)while(q--)r[q]||s[q]||(s[q]=F.call(i));s=vb(s)}H.apply(i,s),k&&!f&&s.length>0&&p+b.length>1&&gb.uniqueSort(i)}return k&&(w=v,j=t),r};return c?ib(f):f}return h=gb.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=xb(b[c]),f[u]?d.push(f):e.push(f);f=A(a,yb(e,d)),f.selector=a}return f},i=gb.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(cb,db),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=X.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(cb,db),ab.test(j[0].type)&&pb(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&rb(j),!a)return H.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,ab.test(a)&&pb(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=jb(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),jb(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||kb("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&jb(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||kb("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),jb(function(a){return null==a.getAttribute("disabled")})||kb(K,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),gb}(a);n.find=t,n.expr=t.selectors,n.expr[":"]=n.expr.pseudos,n.unique=t.uniqueSort,n.text=t.getText,n.isXMLDoc=t.isXML,n.contains=t.contains;var u=n.expr.match.needsContext,v=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,w=/^.[^:#\[\.,]*$/;function x(a,b,c){if(n.isFunction(b))return n.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return n.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(w.test(b))return n.filter(b,a,c);b=n.filter(b,a)}return n.grep(a,function(a){return g.call(b,a)>=0!==c})}n.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?n.find.matchesSelector(d,a)?[d]:[]:n.find.matches(a,n.grep(b,function(a){return 1===a.nodeType}))},n.fn.extend({find:function(a){var b,c=this.length,d=[],e=this;if("string"!=typeof a)return this.pushStack(n(a).filter(function(){for(b=0;c>b;b++)if(n.contains(e[b],this))return!0}));for(b=0;c>b;b++)n.find(a,e[b],d);return d=this.pushStack(c>1?n.unique(d):d),d.selector=this.selector?this.selector+" "+a:a,d},filter:function(a){return this.pushStack(x(this,a||[],!1))},not:function(a){return this.pushStack(x(this,a||[],!0))},is:function(a){return!!x(this,"string"==typeof a&&u.test(a)?n(a):a||[],!1).length}});var y,z=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,A=n.fn.init=function(a,b){var c,d;if(!a)return this;if("string"==typeof a){if(c="<"===a[0]&&">"===a[a.length-1]&&a.length>=3?[null,a,null]:z.exec(a),!c||!c[1]&&b)return!b||b.jquery?(b||y).find(a):this.constructor(b).find(a);if(c[1]){if(b=b instanceof n?b[0]:b,n.merge(this,n.parseHTML(c[1],b&&b.nodeType?b.ownerDocument||b:l,!0)),v.test(c[1])&&n.isPlainObject(b))for(c in b)n.isFunction(this[c])?this[c](b[c]):this.attr(c,b[c]);return this}return d=l.getElementById(c[2]),d&&d.parentNode&&(this.length=1,this[0]=d),this.context=l,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):n.isFunction(a)?"undefined"!=typeof y.ready?y.ready(a):a(n):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))};A.prototype=n.fn,y=n(l);var B=/^(?:parents|prev(?:Until|All))/,C={children:!0,contents:!0,next:!0,prev:!0};n.extend({dir:function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&n(a).is(c))break;d.push(a)}return d},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}}),n.fn.extend({has:function(a){var b=n(a,this),c=b.length;return this.filter(function(){for(var a=0;c>a;a++)if(n.contains(this,b[a]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=u.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&n.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?n.unique(f):f)},index:function(a){return a?"string"==typeof a?g.call(n(a),this[0]):g.call(this,a.jquery?a[0]:a):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(n.unique(n.merge(this.get(),n(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function D(a,b){while((a=a[b])&&1!==a.nodeType);return a}n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return n.dir(a,"parentNode")},parentsUntil:function(a,b,c){return n.dir(a,"parentNode",c)},next:function(a){return D(a,"nextSibling")},prev:function(a){return D(a,"previousSibling")},nextAll:function(a){return n.dir(a,"nextSibling")},prevAll:function(a){return n.dir(a,"previousSibling")},nextUntil:function(a,b,c){return n.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return n.dir(a,"previousSibling",c)},siblings:function(a){return n.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return n.sibling(a.firstChild)},contents:function(a){return a.contentDocument||n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),this.length>1&&(C[a]||n.unique(e),B.test(a)&&e.reverse()),this.pushStack(e)}});var E=/\S+/g,F={};function G(a){var b=F[a]={};return n.each(a.match(E)||[],function(a,c){b[c]=!0}),b}n.Callbacks=function(a){a="string"==typeof a?F[a]||G(a):n.extend({},a);var b,c,d,e,f,g,h=[],i=!a.once&&[],j=function(l){for(b=a.memory&&l,c=!0,g=e||0,e=0,f=h.length,d=!0;h&&f>g;g++)if(h[g].apply(l[0],l[1])===!1&&a.stopOnFalse){b=!1;break}d=!1,h&&(i?i.length&&j(i.shift()):b?h=[]:k.disable())},k={add:function(){if(h){var c=h.length;!function g(b){n.each(b,function(b,c){var d=n.type(c);"function"===d?a.unique&&k.has(c)||h.push(c):c&&c.length&&"string"!==d&&g(c)})}(arguments),d?f=h.length:b&&(e=c,j(b))}return this},remove:function(){return h&&n.each(arguments,function(a,b){var c;while((c=n.inArray(b,h,c))>-1)h.splice(c,1),d&&(f>=c&&f--,g>=c&&g--)}),this},has:function(a){return a?n.inArray(a,h)>-1:!(!h||!h.length)},empty:function(){return h=[],f=0,this},disable:function(){return h=i=b=void 0,this},disabled:function(){return!h},lock:function(){return i=void 0,b||k.disable(),this},locked:function(){return!i},fireWith:function(a,b){return!h||c&&!i||(b=b||[],b=[a,b.slice?b.slice():b],d?i.push(b):j(b)),this},fire:function(){return k.fireWith(this,arguments),this},fired:function(){return!!c}};return k},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,f){var g=n.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=d.call(arguments),e=c.length,f=1!==e||a&&n.isFunction(a.promise)?e:0,g=1===f?a:n.Deferred(),h=function(a,b,c){return function(e){b[a]=this,c[a]=arguments.length>1?d.call(arguments):e,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(e>1)for(i=new Array(e),j=new Array(e),k=new Array(e);e>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().done(h(b,k,c)).fail(g.reject).progress(h(b,j,i)):--f;return f||g.resolveWith(k,c),g.promise()}});var H;n.fn.ready=function(a){return n.ready.promise().done(a),this},n.extend({isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){(a===!0?--n.readyWait:n.isReady)||(n.isReady=!0,a!==!0&&--n.readyWait>0||(H.resolveWith(l,[n]),n.fn.triggerHandler&&(n(l).triggerHandler("ready"),n(l).off("ready"))))}});function I(){l.removeEventListener("DOMContentLoaded",I,!1),a.removeEventListener("load",I,!1),n.ready()}n.ready.promise=function(b){return H||(H=n.Deferred(),"complete"===l.readyState?setTimeout(n.ready):(l.addEventListener("DOMContentLoaded",I,!1),a.addEventListener("load",I,!1))),H.promise(b)},n.ready.promise();var J=n.access=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===n.type(c)){e=!0;for(h in c)n.access(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,n.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(n(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f};n.acceptData=function(a){return 1===a.nodeType||9===a.nodeType||!+a.nodeType};function K(){Object.defineProperty(this.cache={},0,{get:function(){return{}}}),this.expando=n.expando+K.uid++}K.uid=1,K.accepts=n.acceptData,K.prototype={key:function(a){if(!K.accepts(a))return 0;var b={},c=a[this.expando];if(!c){c=K.uid++;try{b[this.expando]={value:c},Object.defineProperties(a,b)}catch(d){b[this.expando]=c,n.extend(a,b)}}return this.cache[c]||(this.cache[c]={}),c},set:function(a,b,c){var d,e=this.key(a),f=this.cache[e];if("string"==typeof b)f[b]=c;else if(n.isEmptyObject(f))n.extend(this.cache[e],b);else for(d in b)f[d]=b[d];return f},get:function(a,b){var c=this.cache[this.key(a)];return void 0===b?c:c[b]},access:function(a,b,c){var d;return void 0===b||b&&"string"==typeof b&&void 0===c?(d=this.get(a,b),void 0!==d?d:this.get(a,n.camelCase(b))):(this.set(a,b,c),void 0!==c?c:b)},remove:function(a,b){var c,d,e,f=this.key(a),g=this.cache[f];if(void 0===b)this.cache[f]={};else{n.isArray(b)?d=b.concat(b.map(n.camelCase)):(e=n.camelCase(b),b in g?d=[b,e]:(d=e,d=d in g?[d]:d.match(E)||[])),c=d.length;while(c--)delete g[d[c]]}},hasData:function(a){return!n.isEmptyObject(this.cache[a[this.expando]]||{})},discard:function(a){a[this.expando]&&delete this.cache[a[this.expando]]}};var L=new K,M=new K,N=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,O=/([A-Z])/g;function P(a,b,c){var d;if(void 0===c&&1===a.nodeType)if(d="data-"+b.replace(O,"-$1").toLowerCase(),c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:N.test(c)?n.parseJSON(c):c}catch(e){}M.set(a,b,c)}else c=void 0;return c}n.extend({hasData:function(a){return M.hasData(a)||L.hasData(a)},data:function(a,b,c){return M.access(a,b,c)
},removeData:function(a,b){M.remove(a,b)},_data:function(a,b,c){return L.access(a,b,c)},_removeData:function(a,b){L.remove(a,b)}}),n.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=M.get(f),1===f.nodeType&&!L.get(f,"hasDataAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=n.camelCase(d.slice(5)),P(f,d,e[d])));L.set(f,"hasDataAttrs",!0)}return e}return"object"==typeof a?this.each(function(){M.set(this,a)}):J(this,function(b){var c,d=n.camelCase(a);if(f&&void 0===b){if(c=M.get(f,a),void 0!==c)return c;if(c=M.get(f,d),void 0!==c)return c;if(c=P(f,d,void 0),void 0!==c)return c}else this.each(function(){var c=M.get(this,d);M.set(this,d,b),-1!==a.indexOf("-")&&void 0!==c&&M.set(this,a,b)})},null,b,arguments.length>1,null,!0)},removeData:function(a){return this.each(function(){M.remove(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=L.get(a,b),c&&(!d||n.isArray(c)?d=L.access(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.length,e=c.shift(),f=n._queueHooks(a,b),g=function(){n.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return L.get(a,c)||L.access(a,c,{empty:n.Callbacks("once memory").add(function(){L.remove(a,[b+"queue",c])})})}}),n.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?n.queue(this[0],a):void 0===b?this:this.each(function(){var c=n.queue(this,a,b);n._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=n.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=L.get(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var Q=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,R=["Top","Right","Bottom","Left"],S=function(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)},T=/^(?:checkbox|radio)$/i;!function(){var a=l.createDocumentFragment(),b=a.appendChild(l.createElement("div")),c=l.createElement("input");c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),b.appendChild(c),k.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,b.innerHTML="<textarea>x</textarea>",k.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue}();var U="undefined";k.focusinBubbles="onfocusin"in a;var V=/^key/,W=/^(?:mouse|pointer|contextmenu)|click/,X=/^(?:focusinfocus|focusoutblur)$/,Y=/^([^.]*)(?:\.(.+)|)$/;function Z(){return!0}function $(){return!1}function _(){try{return l.activeElement}catch(a){}}n.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.get(a);if(r){c.handler&&(f=c,c=f.handler,e=f.selector),c.guid||(c.guid=n.guid++),(i=r.events)||(i=r.events={}),(g=r.handle)||(g=r.handle=function(b){return typeof n!==U&&n.event.triggered!==b.type?n.event.dispatch.apply(a,arguments):void 0}),b=(b||"").match(E)||[""],j=b.length;while(j--)h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o&&(l=n.event.special[o]||{},o=(e?l.delegateType:l.bindType)||o,l=n.event.special[o]||{},k=n.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&n.expr.match.needsContext.test(e),namespace:p.join(".")},f),(m=i[o])||(m=i[o]=[],m.delegateCount=0,l.setup&&l.setup.call(a,d,p,g)!==!1||a.addEventListener&&a.addEventListener(o,g,!1)),l.add&&(l.add.call(a,k),k.handler.guid||(k.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,k):m.push(k),n.event.global[o]=!0)}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.hasData(a)&&L.get(a);if(r&&(i=r.events)){b=(b||"").match(E)||[""],j=b.length;while(j--)if(h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=n.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,m=i[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),g=f=m.length;while(f--)k=m[f],!e&&q!==k.origType||c&&c.guid!==k.guid||h&&!h.test(k.namespace)||d&&d!==k.selector&&("**"!==d||!k.selector)||(m.splice(f,1),k.selector&&m.delegateCount--,l.remove&&l.remove.call(a,k));g&&!m.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||n.removeEvent(a,o,r.handle),delete i[o])}else for(o in i)n.event.remove(a,o+b[j],c,d,!0);n.isEmptyObject(i)&&(delete r.handle,L.remove(a,"events"))}},trigger:function(b,c,d,e){var f,g,h,i,k,m,o,p=[d||l],q=j.call(b,"type")?b.type:b,r=j.call(b,"namespace")?b.namespace.split("."):[];if(g=h=d=d||l,3!==d.nodeType&&8!==d.nodeType&&!X.test(q+n.event.triggered)&&(q.indexOf(".")>=0&&(r=q.split("."),q=r.shift(),r.sort()),k=q.indexOf(":")<0&&"on"+q,b=b[n.expando]?b:new n.Event(q,"object"==typeof b&&b),b.isTrigger=e?2:3,b.namespace=r.join("."),b.namespace_re=b.namespace?new RegExp("(^|\\.)"+r.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=d),c=null==c?[b]:n.makeArray(c,[b]),o=n.event.special[q]||{},e||!o.trigger||o.trigger.apply(d,c)!==!1)){if(!e&&!o.noBubble&&!n.isWindow(d)){for(i=o.delegateType||q,X.test(i+q)||(g=g.parentNode);g;g=g.parentNode)p.push(g),h=g;h===(d.ownerDocument||l)&&p.push(h.defaultView||h.parentWindow||a)}f=0;while((g=p[f++])&&!b.isPropagationStopped())b.type=f>1?i:o.bindType||q,m=(L.get(g,"events")||{})[b.type]&&L.get(g,"handle"),m&&m.apply(g,c),m=k&&g[k],m&&m.apply&&n.acceptData(g)&&(b.result=m.apply(g,c),b.result===!1&&b.preventDefault());return b.type=q,e||b.isDefaultPrevented()||o._default&&o._default.apply(p.pop(),c)!==!1||!n.acceptData(d)||k&&n.isFunction(d[q])&&!n.isWindow(d)&&(h=d[k],h&&(d[k]=null),n.event.triggered=q,d[q](),n.event.triggered=void 0,h&&(d[k]=h)),b.result}},dispatch:function(a){a=n.event.fix(a);var b,c,e,f,g,h=[],i=d.call(arguments),j=(L.get(this,"events")||{})[a.type]||[],k=n.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=n.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,c=0;while((g=f.handlers[c++])&&!a.isImmediatePropagationStopped())(!a.namespace_re||a.namespace_re.test(g.namespace))&&(a.handleObj=g,a.data=g.data,e=((n.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==e&&(a.result=e)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&(!a.button||"click"!==a.type))for(;i!==this;i=i.parentNode||this)if(i.disabled!==!0||"click"!==a.type){for(d=[],c=0;h>c;c++)f=b[c],e=f.selector+" ",void 0===d[e]&&(d[e]=f.needsContext?n(e,this).index(i)>=0:n.find(e,this,null,[i]).length),d[e]&&d.push(f);d.length&&g.push({elem:i,handlers:d})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,d,e,f=b.button;return null==a.pageX&&null!=b.clientX&&(c=a.target.ownerDocument||l,d=c.documentElement,e=c.body,a.pageX=b.clientX+(d&&d.scrollLeft||e&&e.scrollLeft||0)-(d&&d.clientLeft||e&&e.clientLeft||0),a.pageY=b.clientY+(d&&d.scrollTop||e&&e.scrollTop||0)-(d&&d.clientTop||e&&e.clientTop||0)),a.which||void 0===f||(a.which=1&f?1:2&f?3:4&f?2:0),a}},fix:function(a){if(a[n.expando])return a;var b,c,d,e=a.type,f=a,g=this.fixHooks[e];g||(this.fixHooks[e]=g=W.test(e)?this.mouseHooks:V.test(e)?this.keyHooks:{}),d=g.props?this.props.concat(g.props):this.props,a=new n.Event(f),b=d.length;while(b--)c=d[b],a[c]=f[c];return a.target||(a.target=l),3===a.target.nodeType&&(a.target=a.target.parentNode),g.filter?g.filter(a,f):a},special:{load:{noBubble:!0},focus:{trigger:function(){return this!==_()&&this.focus?(this.focus(),!1):void 0},delegateType:"focusin"},blur:{trigger:function(){return this===_()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return"checkbox"===this.type&&this.click&&n.nodeName(this,"input")?(this.click(),!1):void 0},_default:function(a){return n.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c,d){var e=n.extend(new n.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?n.event.trigger(e,null,b):n.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},n.removeEvent=function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?Z:$):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),void(this[n.expando]=!0)):new n.Event(a,b)},n.Event.prototype={isDefaultPrevented:$,isPropagationStopped:$,isImmediatePropagationStopped:$,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=Z,a&&a.preventDefault&&a.preventDefault()},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=Z,a&&a.stopPropagation&&a.stopPropagation()},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=Z,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},n.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return(!e||e!==d&&!n.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),k.focusinBubbles||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){n.event.simulate(b,a.target,n.event.fix(a),!0)};n.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=L.access(d,b);e||d.addEventListener(a,c,!0),L.access(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=L.access(d,b)-1;e?L.access(d,b,e):(d.removeEventListener(a,c,!0),L.remove(d,b))}}}),n.fn.extend({on:function(a,b,c,d,e){var f,g;if("object"==typeof a){"string"!=typeof b&&(c=c||b,b=void 0);for(g in a)this.on(g,b,c,a[g],e);return this}if(null==c&&null==d?(d=b,c=b=void 0):null==d&&("string"==typeof b?(d=c,c=void 0):(d=c,c=b,b=void 0)),d===!1)d=$;else if(!d)return this;return 1===e&&(f=d,d=function(a){return n().off(a),f.apply(this,arguments)},d.guid=f.guid||(f.guid=n.guid++)),this.each(function(){n.event.add(this,a,d,c,b)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,n(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return(b===!1||"function"==typeof b)&&(c=b,b=void 0),c===!1&&(c=$),this.each(function(){n.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?n.event.trigger(a,b,c,!0):void 0}});var ab=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,bb=/<([\w:]+)/,cb=/<|&#?\w+;/,db=/<(?:script|style|link)/i,eb=/checked\s*(?:[^=]|=\s*.checked.)/i,fb=/^$|\/(?:java|ecma)script/i,gb=/^true\/(.*)/,hb=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,ib={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};ib.optgroup=ib.option,ib.tbody=ib.tfoot=ib.colgroup=ib.caption=ib.thead,ib.th=ib.td;function jb(a,b){return n.nodeName(a,"table")&&n.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function kb(a){return a.type=(null!==a.getAttribute("type"))+"/"+a.type,a}function lb(a){var b=gb.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function mb(a,b){for(var c=0,d=a.length;d>c;c++)L.set(a[c],"globalEval",!b||L.get(b[c],"globalEval"))}function nb(a,b){var c,d,e,f,g,h,i,j;if(1===b.nodeType){if(L.hasData(a)&&(f=L.access(a),g=L.set(b,f),j=f.events)){delete g.handle,g.events={};for(e in j)for(c=0,d=j[e].length;d>c;c++)n.event.add(b,e,j[e][c])}M.hasData(a)&&(h=M.access(a),i=n.extend({},h),M.set(b,i))}}function ob(a,b){var c=a.getElementsByTagName?a.getElementsByTagName(b||"*"):a.querySelectorAll?a.querySelectorAll(b||"*"):[];return void 0===b||b&&n.nodeName(a,b)?n.merge([a],c):c}function pb(a,b){var c=b.nodeName.toLowerCase();"input"===c&&T.test(a.type)?b.checked=a.checked:("input"===c||"textarea"===c)&&(b.defaultValue=a.defaultValue)}n.extend({clone:function(a,b,c){var d,e,f,g,h=a.cloneNode(!0),i=n.contains(a.ownerDocument,a);if(!(k.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(g=ob(h),f=ob(a),d=0,e=f.length;e>d;d++)pb(f[d],g[d]);if(b)if(c)for(f=f||ob(a),g=g||ob(h),d=0,e=f.length;e>d;d++)nb(f[d],g[d]);else nb(a,h);return g=ob(h,"script"),g.length>0&&mb(g,!i&&ob(a,"script")),h},buildFragment:function(a,b,c,d){for(var e,f,g,h,i,j,k=b.createDocumentFragment(),l=[],m=0,o=a.length;o>m;m++)if(e=a[m],e||0===e)if("object"===n.type(e))n.merge(l,e.nodeType?[e]:e);else if(cb.test(e)){f=f||k.appendChild(b.createElement("div")),g=(bb.exec(e)||["",""])[1].toLowerCase(),h=ib[g]||ib._default,f.innerHTML=h[1]+e.replace(ab,"<$1></$2>")+h[2],j=h[0];while(j--)f=f.lastChild;n.merge(l,f.childNodes),f=k.firstChild,f.textContent=""}else l.push(b.createTextNode(e));k.textContent="",m=0;while(e=l[m++])if((!d||-1===n.inArray(e,d))&&(i=n.contains(e.ownerDocument,e),f=ob(k.appendChild(e),"script"),i&&mb(f),c)){j=0;while(e=f[j++])fb.test(e.type||"")&&c.push(e)}return k},cleanData:function(a){for(var b,c,d,e,f=n.event.special,g=0;void 0!==(c=a[g]);g++){if(n.acceptData(c)&&(e=c[L.expando],e&&(b=L.cache[e]))){if(b.events)for(d in b.events)f[d]?n.event.remove(c,d):n.removeEvent(c,d,b.handle);L.cache[e]&&delete L.cache[e]}delete M.cache[c[M.expando]]}}}),n.fn.extend({text:function(a){return J(this,function(a){return void 0===a?n.text(this):this.empty().each(function(){(1===this.nodeType||11===this.nodeType||9===this.nodeType)&&(this.textContent=a)})},null,a,arguments.length)},append:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=jb(this,a);b.appendChild(a)}})},prepend:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=jb(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},remove:function(a,b){for(var c,d=a?n.filter(a,this):this,e=0;null!=(c=d[e]);e++)b||1!==c.nodeType||n.cleanData(ob(c)),c.parentNode&&(b&&n.contains(c.ownerDocument,c)&&mb(ob(c,"script")),c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)1===a.nodeType&&(n.cleanData(ob(a,!1)),a.textContent="");return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return J(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a&&1===b.nodeType)return b.innerHTML;if("string"==typeof a&&!db.test(a)&&!ib[(bb.exec(a)||["",""])[1].toLowerCase()]){a=a.replace(ab,"<$1></$2>");try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(n.cleanData(ob(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=arguments[0];return this.domManip(arguments,function(b){a=this.parentNode,n.cleanData(ob(this)),a&&a.replaceChild(b,this)}),a&&(a.length||a.nodeType)?this:this.remove()},detach:function(a){return this.remove(a,!0)},domManip:function(a,b){a=e.apply([],a);var c,d,f,g,h,i,j=0,l=this.length,m=this,o=l-1,p=a[0],q=n.isFunction(p);if(q||l>1&&"string"==typeof p&&!k.checkClone&&eb.test(p))return this.each(function(c){var d=m.eq(c);q&&(a[0]=p.call(this,c,d.html())),d.domManip(a,b)});if(l&&(c=n.buildFragment(a,this[0].ownerDocument,!1,this),d=c.firstChild,1===c.childNodes.length&&(c=d),d)){for(f=n.map(ob(c,"script"),kb),g=f.length;l>j;j++)h=c,j!==o&&(h=n.clone(h,!0,!0),g&&n.merge(f,ob(h,"script"))),b.call(this[j],h,j);if(g)for(i=f[f.length-1].ownerDocument,n.map(f,lb),j=0;g>j;j++)h=f[j],fb.test(h.type||"")&&!L.access(h,"globalEval")&&n.contains(i,h)&&(h.src?n._evalUrl&&n._evalUrl(h.src):n.globalEval(h.textContent.replace(hb,"")))}return this}}),n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(a){for(var c,d=[],e=n(a),g=e.length-1,h=0;g>=h;h++)c=h===g?this:this.clone(!0),n(e[h])[b](c),f.apply(d,c.get());return this.pushStack(d)}});var qb,rb={};function sb(b,c){var d,e=n(c.createElement(b)).appendTo(c.body),f=a.getDefaultComputedStyle&&(d=a.getDefaultComputedStyle(e[0]))?d.display:n.css(e[0],"display");return e.detach(),f}function tb(a){var b=l,c=rb[a];return c||(c=sb(a,b),"none"!==c&&c||(qb=(qb||n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=qb[0].contentDocument,b.write(),b.close(),c=sb(a,b),qb.detach()),rb[a]=c),c}var ub=/^margin/,vb=new RegExp("^("+Q+")(?!px)[a-z%]+$","i"),wb=function(b){return b.ownerDocument.defaultView.opener?b.ownerDocument.defaultView.getComputedStyle(b,null):a.getComputedStyle(b,null)};function xb(a,b,c){var d,e,f,g,h=a.style;return c=c||wb(a),c&&(g=c.getPropertyValue(b)||c[b]),c&&(""!==g||n.contains(a.ownerDocument,a)||(g=n.style(a,b)),vb.test(g)&&ub.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0!==g?g+"":g}function yb(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}!function(){var b,c,d=l.documentElement,e=l.createElement("div"),f=l.createElement("div");if(f.style){f.style.backgroundClip="content-box",f.cloneNode(!0).style.backgroundClip="",k.clearCloneStyle="content-box"===f.style.backgroundClip,e.style.cssText="border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;position:absolute",e.appendChild(f);function g(){f.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute",f.innerHTML="",d.appendChild(e);var g=a.getComputedStyle(f,null);b="1%"!==g.top,c="4px"===g.width,d.removeChild(e)}a.getComputedStyle&&n.extend(k,{pixelPosition:function(){return g(),b},boxSizingReliable:function(){return null==c&&g(),c},reliableMarginRight:function(){var b,c=f.appendChild(l.createElement("div"));return c.style.cssText=f.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",c.style.marginRight=c.style.width="0",f.style.width="1px",d.appendChild(e),b=!parseFloat(a.getComputedStyle(c,null).marginRight),d.removeChild(e),f.removeChild(c),b}})}}(),n.swap=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};var zb=/^(none|table(?!-c[ea]).+)/,Ab=new RegExp("^("+Q+")(.*)$","i"),Bb=new RegExp("^([+-])=("+Q+")","i"),Cb={position:"absolute",visibility:"hidden",display:"block"},Db={letterSpacing:"0",fontWeight:"400"},Eb=["Webkit","O","Moz","ms"];function Fb(a,b){if(b in a)return b;var c=b[0].toUpperCase()+b.slice(1),d=b,e=Eb.length;while(e--)if(b=Eb[e]+c,b in a)return b;return d}function Gb(a,b,c){var d=Ab.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Hb(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=n.css(a,c+R[f],!0,e)),d?("content"===c&&(g-=n.css(a,"padding"+R[f],!0,e)),"margin"!==c&&(g-=n.css(a,"border"+R[f]+"Width",!0,e))):(g+=n.css(a,"padding"+R[f],!0,e),"padding"!==c&&(g+=n.css(a,"border"+R[f]+"Width",!0,e)));return g}function Ib(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=wb(a),g="border-box"===n.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=xb(a,b,f),(0>e||null==e)&&(e=a.style[b]),vb.test(e))return e;d=g&&(k.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Hb(a,b,c||(g?"border":"content"),d,f)+"px"}function Jb(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=L.get(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&S(d)&&(f[g]=L.access(d,"olddisplay",tb(d.nodeName)))):(e=S(d),"none"===c&&e||L.set(d,"olddisplay",e?c:n.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=xb(a,"opacity");return""===c?"1":c}}}},cssNumber:{columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=n.camelCase(b),i=a.style;return b=n.cssProps[h]||(n.cssProps[h]=Fb(i,h)),g=n.cssHooks[b]||n.cssHooks[h],void 0===c?g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b]:(f=typeof c,"string"===f&&(e=Bb.exec(c))&&(c=(e[1]+1)*e[2]+parseFloat(n.css(a,b)),f="number"),null!=c&&c===c&&("number"!==f||n.cssNumber[h]||(c+="px"),k.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),g&&"set"in g&&void 0===(c=g.set(a,c,d))||(i[b]=c)),void 0)}},css:function(a,b,c,d){var e,f,g,h=n.camelCase(b);return b=n.cssProps[h]||(n.cssProps[h]=Fb(a.style,h)),g=n.cssHooks[b]||n.cssHooks[h],g&&"get"in g&&(e=g.get(a,!0,c)),void 0===e&&(e=xb(a,b,d)),"normal"===e&&b in Db&&(e=Db[b]),""===c||c?(f=parseFloat(e),c===!0||n.isNumeric(f)?f||0:e):e}}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?zb.test(n.css(a,"display"))&&0===a.offsetWidth?n.swap(a,Cb,function(){return Ib(a,b,d)}):Ib(a,b,d):void 0},set:function(a,c,d){var e=d&&wb(a);return Gb(a,c,d?Hb(a,b,d,"border-box"===n.css(a,"boxSizing",!1,e),e):0)}}}),n.cssHooks.marginRight=yb(k.reliableMarginRight,function(a,b){return b?n.swap(a,{display:"inline-block"},xb,[a,"marginRight"]):void 0}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+R[d]+b]=f[d]||f[d-2]||f[0];return e}},ub.test(a)||(n.cssHooks[a+b].set=Gb)}),n.fn.extend({css:function(a,b){return J(this,function(a,b,c){var d,e,f={},g=0;if(n.isArray(b)){for(d=wb(a),e=b.length;e>g;g++)f[b[g]]=n.css(a,b[g],!1,d);return f}return void 0!==c?n.style(a,b,c):n.css(a,b)},a,b,arguments.length>1)},show:function(){return Jb(this,!0)},hide:function(){return Jb(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){S(this)?n(this).show():n(this).hide()})}});function Kb(a,b,c,d,e){return new Kb.prototype.init(a,b,c,d,e)}n.Tween=Kb,Kb.prototype={constructor:Kb,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=Kb.propHooks[this.prop];return a&&a.get?a.get(this):Kb.propHooks._default.get(this)},run:function(a){var b,c=Kb.propHooks[this.prop];return this.pos=b=this.options.duration?n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Kb.propHooks._default.set(this),this}},Kb.prototype.init.prototype=Kb.prototype,Kb.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=n.css(a.elem,a.prop,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[n.cssProps[a.prop]]||n.cssHooks[a.prop])?n.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Kb.propHooks.scrollTop=Kb.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},n.fx=Kb.prototype.init,n.fx.step={};var Lb,Mb,Nb=/^(?:toggle|show|hide)$/,Ob=new RegExp("^(?:([+-])=|)("+Q+")([a-z%]*)$","i"),Pb=/queueHooks$/,Qb=[Vb],Rb={"*":[function(a,b){var c=this.createTween(a,b),d=c.cur(),e=Ob.exec(b),f=e&&e[3]||(n.cssNumber[a]?"":"px"),g=(n.cssNumber[a]||"px"!==f&&+d)&&Ob.exec(n.css(c.elem,a)),h=1,i=20;if(g&&g[3]!==f){f=f||g[3],e=e||[],g=+d||1;do h=h||".5",g/=h,n.style(c.elem,a,g+f);while(h!==(h=c.cur()/d)&&1!==h&&--i)}return e&&(g=c.start=+g||+d||0,c.unit=f,c.end=e[1]?g+(e[1]+1)*e[2]:+e[2]),c}]};function Sb(){return setTimeout(function(){Lb=void 0}),Lb=n.now()}function Tb(a,b){var c,d=0,e={height:a};for(b=b?1:0;4>d;d+=2-b)c=R[d],e["margin"+c]=e["padding"+c]=a;return b&&(e.opacity=e.width=a),e}function Ub(a,b,c){for(var d,e=(Rb[b]||[]).concat(Rb["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function Vb(a,b,c){var d,e,f,g,h,i,j,k,l=this,m={},o=a.style,p=a.nodeType&&S(a),q=L.get(a,"fxshow");c.queue||(h=n._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,l.always(function(){l.always(function(){h.unqueued--,n.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[o.overflow,o.overflowX,o.overflowY],j=n.css(a,"display"),k="none"===j?L.get(a,"olddisplay")||tb(a.nodeName):j,"inline"===k&&"none"===n.css(a,"float")&&(o.display="inline-block")),c.overflow&&(o.overflow="hidden",l.always(function(){o.overflow=c.overflow[0],o.overflowX=c.overflow[1],o.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],Nb.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(p?"hide":"show")){if("show"!==e||!q||void 0===q[d])continue;p=!0}m[d]=q&&q[d]||n.style(a,d)}else j=void 0;if(n.isEmptyObject(m))"inline"===("none"===j?tb(a.nodeName):j)&&(o.display=j);else{q?"hidden"in q&&(p=q.hidden):q=L.access(a,"fxshow",{}),f&&(q.hidden=!p),p?n(a).show():l.done(function(){n(a).hide()}),l.done(function(){var b;L.remove(a,"fxshow");for(b in m)n.style(a,b,m[b])});for(d in m)g=Ub(p?q[d]:0,d,l),d in q||(q[d]=g.start,p&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function Wb(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function Xb(a,b,c){var d,e,f=0,g=Qb.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=Lb||Sb(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:Lb||Sb(),duration:c.duration,tweens:[],createTween:function(b,c){var d=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(Wb(k,j.opts.specialEasing);g>f;f++)if(d=Qb[f].call(j,a,k,j.opts))return d;return n.map(k,Ub,j),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}n.Animation=n.extend(Xb,{tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],Rb[c]=Rb[c]||[],Rb[c].unshift(b)},prefilter:function(a,b){b?Qb.unshift(a):Qb.push(a)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(S).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=Xb(this,n.extend({},a),f);(e||L.get(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=n.timers,g=L.get(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&Pb.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));(b||!c)&&n.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=L.get(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=n.timers,g=d?d.length:0;for(c.finish=!0,n.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(Tb(b,!0),a,d,e)}}),n.each({slideDown:Tb("show"),slideUp:Tb("hide"),slideToggle:Tb("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.timers=[],n.fx.tick=function(){var a,b=0,c=n.timers;for(Lb=n.now();b<c.length;b++)a=c[b],a()||c[b]!==a||c.splice(b--,1);c.length||n.fx.stop(),Lb=void 0},n.fx.timer=function(a){n.timers.push(a),a()?n.fx.start():n.timers.pop()},n.fx.interval=13,n.fx.start=function(){Mb||(Mb=setInterval(n.fx.tick,n.fx.interval))},n.fx.stop=function(){clearInterval(Mb),Mb=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fn.delay=function(a,b){return a=n.fx?n.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},function(){var a=l.createElement("input"),b=l.createElement("select"),c=b.appendChild(l.createElement("option"));a.type="checkbox",k.checkOn=""!==a.value,k.optSelected=c.selected,b.disabled=!0,k.optDisabled=!c.disabled,a=l.createElement("input"),a.value="t",a.type="radio",k.radioValue="t"===a.value}();var Yb,Zb,$b=n.expr.attrHandle;n.fn.extend({attr:function(a,b){return J(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})}}),n.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(a&&3!==f&&8!==f&&2!==f)return typeof a.getAttribute===U?n.prop(a,b,c):(1===f&&n.isXMLDoc(a)||(b=b.toLowerCase(),d=n.attrHooks[b]||(n.expr.match.bool.test(b)?Zb:Yb)),void 0===c?d&&"get"in d&&null!==(e=d.get(a,b))?e:(e=n.find.attr(a,b),null==e?void 0:e):null!==c?d&&"set"in d&&void 0!==(e=d.set(a,c,b))?e:(a.setAttribute(b,c+""),c):void n.removeAttr(a,b))
},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(E);if(f&&1===a.nodeType)while(c=f[e++])d=n.propFix[c]||c,n.expr.match.bool.test(c)&&(a[d]=!1),a.removeAttribute(c)},attrHooks:{type:{set:function(a,b){if(!k.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}}}),Zb={set:function(a,b,c){return b===!1?n.removeAttr(a,c):a.setAttribute(c,c),c}},n.each(n.expr.match.bool.source.match(/\w+/g),function(a,b){var c=$b[b]||n.find.attr;$b[b]=function(a,b,d){var e,f;return d||(f=$b[b],$b[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,$b[b]=f),e}});var _b=/^(?:input|select|textarea|button)$/i;n.fn.extend({prop:function(a,b){return J(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return this.each(function(){delete this[n.propFix[a]||a]})}}),n.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(a,b,c){var d,e,f,g=a.nodeType;if(a&&3!==g&&8!==g&&2!==g)return f=1!==g||!n.isXMLDoc(a),f&&(b=n.propFix[b]||b,e=n.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){return a.hasAttribute("tabindex")||_b.test(a.nodeName)||a.href?a.tabIndex:-1}}}}),k.optSelected||(n.propHooks.selected={get:function(a){var b=a.parentNode;return b&&b.parentNode&&b.parentNode.selectedIndex,null}}),n.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){n.propFix[this.toLowerCase()]=this});var ac=/[\t\r\n\f]/g;n.fn.extend({addClass:function(a){var b,c,d,e,f,g,h="string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ac," "):" ")){f=0;while(e=b[f++])d.indexOf(" "+e+" ")<0&&(d+=e+" ");g=n.trim(d),c.className!==g&&(c.className=g)}return this},removeClass:function(a){var b,c,d,e,f,g,h=0===arguments.length||"string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ac," "):"")){f=0;while(e=b[f++])while(d.indexOf(" "+e+" ")>=0)d=d.replace(" "+e+" "," ");g=a?n.trim(d):"",c.className!==g&&(c.className=g)}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):this.each(n.isFunction(a)?function(c){n(this).toggleClass(a.call(this,c,this.className,b),b)}:function(){if("string"===c){var b,d=0,e=n(this),f=a.match(E)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else(c===U||"boolean"===c)&&(this.className&&L.set(this,"__className__",this.className),this.className=this.className||a===!1?"":L.get(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(ac," ").indexOf(b)>=0)return!0;return!1}});var bc=/\r/g;n.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=n.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,n(this).val()):a,null==e?e="":"number"==typeof e?e+="":n.isArray(e)&&(e=n.map(e,function(a){return null==a?"":a+""})),b=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=n.valHooks[e.type]||n.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(bc,""):null==c?"":c)}}}),n.extend({valHooks:{option:{get:function(a){var b=n.find.attr(a,"value");return null!=b?b:n.trim(n.text(a))}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],!(!c.selected&&i!==e||(k.optDisabled?c.disabled:null!==c.getAttribute("disabled"))||c.parentNode.disabled&&n.nodeName(c.parentNode,"optgroup"))){if(b=n(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=n.makeArray(b),g=e.length;while(g--)d=e[g],(d.selected=n.inArray(d.value,f)>=0)&&(c=!0);return c||(a.selectedIndex=-1),f}}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]={set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>=0:void 0}},k.checkOn||(n.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),n.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}});var cc=n.now(),dc=/\?/;n.parseJSON=function(a){return JSON.parse(a+"")},n.parseXML=function(a){var b,c;if(!a||"string"!=typeof a)return null;try{c=new DOMParser,b=c.parseFromString(a,"text/xml")}catch(d){b=void 0}return(!b||b.getElementsByTagName("parsererror").length)&&n.error("Invalid XML: "+a),b};var ec=/#.*$/,fc=/([?&])_=[^&]*/,gc=/^(.*?):[ \t]*([^\r\n]*)$/gm,hc=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,ic=/^(?:GET|HEAD)$/,jc=/^\/\//,kc=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,lc={},mc={},nc="*/".concat("*"),oc=a.location.href,pc=kc.exec(oc.toLowerCase())||[];function qc(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(E)||[];if(n.isFunction(c))while(d=f[e++])"+"===d[0]?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function rc(a,b,c,d){var e={},f=a===mc;function g(h){var i;return e[h]=!0,n.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function sc(a,b){var c,d,e=n.ajaxSettings.flatOptions||{};for(c in b)void 0!==b[c]&&((e[c]?a:d||(d={}))[c]=b[c]);return d&&n.extend(!0,a,d),a}function tc(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===d&&(d=a.mimeType||b.getResponseHeader("Content-Type"));if(d)for(e in h)if(h[e]&&h[e].test(d)){i.unshift(e);break}if(i[0]in c)f=i[0];else{for(e in c){if(!i[0]||a.converters[e+" "+i[0]]){f=e;break}g||(g=e)}f=f||g}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function uc(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}n.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:oc,type:"GET",isLocal:hc.test(pc[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":nc,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?sc(sc(a,n.ajaxSettings),b):sc(n.ajaxSettings,a)},ajaxPrefilter:qc(lc),ajaxTransport:qc(mc),ajax:function(a,b){"object"==typeof a&&(b=a,a=void 0),b=b||{};var c,d,e,f,g,h,i,j,k=n.ajaxSetup({},b),l=k.context||k,m=k.context&&(l.nodeType||l.jquery)?n(l):n.event,o=n.Deferred(),p=n.Callbacks("once memory"),q=k.statusCode||{},r={},s={},t=0,u="canceled",v={readyState:0,getResponseHeader:function(a){var b;if(2===t){if(!f){f={};while(b=gc.exec(e))f[b[1].toLowerCase()]=b[2]}b=f[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===t?e:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return t||(a=s[c]=s[c]||a,r[a]=b),this},overrideMimeType:function(a){return t||(k.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>t)for(b in a)q[b]=[q[b],a[b]];else v.always(a[v.status]);return this},abort:function(a){var b=a||u;return c&&c.abort(b),x(0,b),this}};if(o.promise(v).complete=p.add,v.success=v.done,v.error=v.fail,k.url=((a||k.url||oc)+"").replace(ec,"").replace(jc,pc[1]+"//"),k.type=b.method||b.type||k.method||k.type,k.dataTypes=n.trim(k.dataType||"*").toLowerCase().match(E)||[""],null==k.crossDomain&&(h=kc.exec(k.url.toLowerCase()),k.crossDomain=!(!h||h[1]===pc[1]&&h[2]===pc[2]&&(h[3]||("http:"===h[1]?"80":"443"))===(pc[3]||("http:"===pc[1]?"80":"443")))),k.data&&k.processData&&"string"!=typeof k.data&&(k.data=n.param(k.data,k.traditional)),rc(lc,k,b,v),2===t)return v;i=n.event&&k.global,i&&0===n.active++&&n.event.trigger("ajaxStart"),k.type=k.type.toUpperCase(),k.hasContent=!ic.test(k.type),d=k.url,k.hasContent||(k.data&&(d=k.url+=(dc.test(d)?"&":"?")+k.data,delete k.data),k.cache===!1&&(k.url=fc.test(d)?d.replace(fc,"$1_="+cc++):d+(dc.test(d)?"&":"?")+"_="+cc++)),k.ifModified&&(n.lastModified[d]&&v.setRequestHeader("If-Modified-Since",n.lastModified[d]),n.etag[d]&&v.setRequestHeader("If-None-Match",n.etag[d])),(k.data&&k.hasContent&&k.contentType!==!1||b.contentType)&&v.setRequestHeader("Content-Type",k.contentType),v.setRequestHeader("Accept",k.dataTypes[0]&&k.accepts[k.dataTypes[0]]?k.accepts[k.dataTypes[0]]+("*"!==k.dataTypes[0]?", "+nc+"; q=0.01":""):k.accepts["*"]);for(j in k.headers)v.setRequestHeader(j,k.headers[j]);if(k.beforeSend&&(k.beforeSend.call(l,v,k)===!1||2===t))return v.abort();u="abort";for(j in{success:1,error:1,complete:1})v[j](k[j]);if(c=rc(mc,k,b,v)){v.readyState=1,i&&m.trigger("ajaxSend",[v,k]),k.async&&k.timeout>0&&(g=setTimeout(function(){v.abort("timeout")},k.timeout));try{t=1,c.send(r,x)}catch(w){if(!(2>t))throw w;x(-1,w)}}else x(-1,"No Transport");function x(a,b,f,h){var j,r,s,u,w,x=b;2!==t&&(t=2,g&&clearTimeout(g),c=void 0,e=h||"",v.readyState=a>0?4:0,j=a>=200&&300>a||304===a,f&&(u=tc(k,v,f)),u=uc(k,u,v,j),j?(k.ifModified&&(w=v.getResponseHeader("Last-Modified"),w&&(n.lastModified[d]=w),w=v.getResponseHeader("etag"),w&&(n.etag[d]=w)),204===a||"HEAD"===k.type?x="nocontent":304===a?x="notmodified":(x=u.state,r=u.data,s=u.error,j=!s)):(s=x,(a||!x)&&(x="error",0>a&&(a=0))),v.status=a,v.statusText=(b||x)+"",j?o.resolveWith(l,[r,x,v]):o.rejectWith(l,[v,x,s]),v.statusCode(q),q=void 0,i&&m.trigger(j?"ajaxSuccess":"ajaxError",[v,k,j?r:s]),p.fireWith(l,[v,x]),i&&(m.trigger("ajaxComplete",[v,k]),--n.active||n.event.trigger("ajaxStop")))}return v},getJSON:function(a,b,c){return n.get(a,b,c,"json")},getScript:function(a,b){return n.get(a,void 0,b,"script")}}),n.each(["get","post"],function(a,b){n[b]=function(a,c,d,e){return n.isFunction(c)&&(e=e||d,d=c,c=void 0),n.ajax({url:a,type:b,dataType:e,data:c,success:d})}}),n._evalUrl=function(a){return n.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},n.fn.extend({wrapAll:function(a){var b;return n.isFunction(a)?this.each(function(b){n(this).wrapAll(a.call(this,b))}):(this[0]&&(b=n(a,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstElementChild)a=a.firstElementChild;return a}).append(this)),this)},wrapInner:function(a){return this.each(n.isFunction(a)?function(b){n(this).wrapInner(a.call(this,b))}:function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()}}),n.expr.filters.hidden=function(a){return a.offsetWidth<=0&&a.offsetHeight<=0},n.expr.filters.visible=function(a){return!n.expr.filters.hidden(a)};var vc=/%20/g,wc=/\[\]$/,xc=/\r?\n/g,yc=/^(?:submit|button|image|reset|file)$/i,zc=/^(?:input|select|textarea|keygen)/i;function Ac(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||wc.test(a)?d(a,e):Ac(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)Ac(a+"["+e+"]",b[e],c,d)}n.param=function(a,b){var c,d=[],e=function(a,b){b=n.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){e(this.name,this.value)});else for(c in a)Ac(c,a[c],b,e);return d.join("&").replace(vc,"+")},n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=n.prop(this,"elements");return a?n.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!n(this).is(":disabled")&&zc.test(this.nodeName)&&!yc.test(a)&&(this.checked||!T.test(a))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(xc,"\r\n")}}):{name:b.name,value:c.replace(xc,"\r\n")}}).get()}}),n.ajaxSettings.xhr=function(){try{return new XMLHttpRequest}catch(a){}};var Bc=0,Cc={},Dc={0:200,1223:204},Ec=n.ajaxSettings.xhr();a.attachEvent&&a.attachEvent("onunload",function(){for(var a in Cc)Cc[a]()}),k.cors=!!Ec&&"withCredentials"in Ec,k.ajax=Ec=!!Ec,n.ajaxTransport(function(a){var b;return k.cors||Ec&&!a.crossDomain?{send:function(c,d){var e,f=a.xhr(),g=++Bc;if(f.open(a.type,a.url,a.async,a.username,a.password),a.xhrFields)for(e in a.xhrFields)f[e]=a.xhrFields[e];a.mimeType&&f.overrideMimeType&&f.overrideMimeType(a.mimeType),a.crossDomain||c["X-Requested-With"]||(c["X-Requested-With"]="XMLHttpRequest");for(e in c)f.setRequestHeader(e,c[e]);b=function(a){return function(){b&&(delete Cc[g],b=f.onload=f.onerror=null,"abort"===a?f.abort():"error"===a?d(f.status,f.statusText):d(Dc[f.status]||f.status,f.statusText,"string"==typeof f.responseText?{text:f.responseText}:void 0,f.getAllResponseHeaders()))}},f.onload=b(),f.onerror=b("error"),b=Cc[g]=b("abort");try{f.send(a.hasContent&&a.data||null)}catch(h){if(b)throw h}},abort:function(){b&&b()}}:void 0}),n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET")}),n.ajaxTransport("script",function(a){if(a.crossDomain){var b,c;return{send:function(d,e){b=n("<script>").prop({async:!0,charset:a.scriptCharset,src:a.url}).on("load error",c=function(a){b.remove(),c=null,a&&e("error"===a.type?404:200,a.type)}),l.head.appendChild(b[0])},abort:function(){c&&c()}}}});var Fc=[],Gc=/(=)\?(?=&|$)|\?\?/;n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Fc.pop()||n.expando+"_"+cc++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(Gc.test(b.url)?"url":"string"==typeof b.data&&!(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&Gc.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=n.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(Gc,"$1"+e):b.jsonp!==!1&&(b.url+=(dc.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||n.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,Fc.push(e)),g&&n.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),n.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||l;var d=v.exec(a),e=!c&&[];return d?[b.createElement(d[1])]:(d=n.buildFragment([a],b,e),e&&e.length&&n(e).remove(),n.merge([],d.childNodes))};var Hc=n.fn.load;n.fn.load=function(a,b,c){if("string"!=typeof a&&Hc)return Hc.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>=0&&(d=n.trim(a.slice(h)),a=a.slice(0,h)),n.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&n.ajax({url:a,type:e,dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?n("<div>").append(n.parseHTML(a)).find(d):a)}).complete(c&&function(a,b){g.each(c,f||[a.responseText,b,a])}),this},n.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length};var Ic=a.document.documentElement;function Jc(a){return n.isWindow(a)?a:9===a.nodeType&&a.defaultView}n.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=n.css(a,"position"),l=n(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=n.css(a,"top"),i=n.css(a,"left"),j=("absolute"===k||"fixed"===k)&&(f+i).indexOf("auto")>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),n.isFunction(b)&&(b=b.call(a,c,h)),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},n.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){n.offset.setOffset(this,a,b)});var b,c,d=this[0],e={top:0,left:0},f=d&&d.ownerDocument;if(f)return b=f.documentElement,n.contains(b,d)?(typeof d.getBoundingClientRect!==U&&(e=d.getBoundingClientRect()),c=Jc(f),{top:e.top+c.pageYOffset-b.clientTop,left:e.left+c.pageXOffset-b.clientLeft}):e},position:function(){if(this[0]){var a,b,c=this[0],d={top:0,left:0};return"fixed"===n.css(c,"position")?b=c.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),n.nodeName(a[0],"html")||(d=a.offset()),d.top+=n.css(a[0],"borderTopWidth",!0),d.left+=n.css(a[0],"borderLeftWidth",!0)),{top:b.top-d.top-n.css(c,"marginTop",!0),left:b.left-d.left-n.css(c,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||Ic;while(a&&!n.nodeName(a,"html")&&"static"===n.css(a,"position"))a=a.offsetParent;return a||Ic})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(b,c){var d="pageYOffset"===c;n.fn[b]=function(e){return J(this,function(b,e,f){var g=Jc(b);return void 0===f?g?g[c]:b[e]:void(g?g.scrollTo(d?a.pageXOffset:f,d?f:a.pageYOffset):b[e]=f)},b,e,arguments.length,null)}}),n.each(["top","left"],function(a,b){n.cssHooks[b]=yb(k.pixelPosition,function(a,c){return c?(c=xb(a,b),vb.test(c)?n(a).position()[b]+"px":c):void 0})}),n.each({Height:"height",Width:"width"},function(a,b){n.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){n.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return J(this,function(b,c,d){var e;return n.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?n.css(b,c,g):n.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),n.fn.size=function(){return this.length},n.fn.andSelf=n.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return n});var Kc=a.jQuery,Lc=a.$;return n.noConflict=function(b){return a.$===n&&(a.$=Lc),b&&a.jQuery===n&&(a.jQuery=Kc),n},typeof b===U&&(a.jQuery=a.$=n),n});

/*! jQuery UI - v1.10.0 - 2013-01-22
* http://jqueryui.com
* Includes: jquery.ui.core.js, jquery.ui.widget.js, jquery.ui.mouse.js, jquery.ui.position.js, jquery.ui.draggable.js, jquery.ui.effect.js, jquery.ui.effect-blind.js, jquery.ui.effect-bounce.js, jquery.ui.effect-clip.js, jquery.ui.effect-drop.js, jquery.ui.effect-explode.js, jquery.ui.effect-fade.js, jquery.ui.effect-fold.js, jquery.ui.effect-highlight.js, jquery.ui.effect-pulsate.js, jquery.ui.effect-scale.js, jquery.ui.effect-shake.js, jquery.ui.effect-slide.js, jquery.ui.effect-transfer.js
* Copyright (c) 2013 jQuery Foundation and other contributors Licensed MIT */

(function(e,t){function i(t,n){var r,i,o,u=t.nodeName.toLowerCase();return"area"===u?(r=t.parentNode,i=r.name,!t.href||!i||r.nodeName.toLowerCase()!=="map"?!1:(o=e("img[usemap=#"+i+"]")[0],!!o&&s(o))):(/input|select|textarea|button|object/.test(u)?!t.disabled:"a"===u?t.href||n:n)&&s(t)}function s(t){return e.expr.filters.visible(t)&&!e(t).parents().addBack().filter(function(){return e.css(this,"visibility")==="hidden"}).length}var n=0,r=/^ui-id-\d+$/;e.ui=e.ui||{};if(e.ui.version)return;e.extend(e.ui,{version:"1.10.0",keyCode:{BACKSPACE:8,COMMA:188,DELETE:46,DOWN:40,END:35,ENTER:13,ESCAPE:27,HOME:36,LEFT:37,NUMPAD_ADD:107,NUMPAD_DECIMAL:110,NUMPAD_DIVIDE:111,NUMPAD_ENTER:108,NUMPAD_MULTIPLY:106,NUMPAD_SUBTRACT:109,PAGE_DOWN:34,PAGE_UP:33,PERIOD:190,RIGHT:39,SPACE:32,TAB:9,UP:38}}),e.fn.extend({_focus:e.fn.focus,focus:function(t,n){return typeof t=="number"?this.each(function(){var r=this;setTimeout(function(){e(r).focus(),n&&n.call(r)},t)}):this._focus.apply(this,arguments)},scrollParent:function(){var t;return e.ui.ie&&/(static|relative)/.test(this.css("position"))||/absolute/.test(this.css("position"))?t=this.parents().filter(function(){return/(relative|absolute|fixed)/.test(e.css(this,"position"))&&/(auto|scroll)/.test(e.css(this,"overflow")+e.css(this,"overflow-y")+e.css(this,"overflow-x"))}).eq(0):t=this.parents().filter(function(){return/(auto|scroll)/.test(e.css(this,"overflow")+e.css(this,"overflow-y")+e.css(this,"overflow-x"))}).eq(0),/fixed/.test(this.css("position"))||!t.length?e(document):t},zIndex:function(n){if(n!==t)return this.css("zIndex",n);if(this.length){var r=e(this[0]),i,s;while(r.length&&r[0]!==document){i=r.css("position");if(i==="absolute"||i==="relative"||i==="fixed"){s=parseInt(r.css("zIndex"),10);if(!isNaN(s)&&s!==0)return s}r=r.parent()}}return 0},uniqueId:function(){return this.each(function(){this.id||(this.id="ui-id-"+ ++n)})},removeUniqueId:function(){return this.each(function(){r.test(this.id)&&e(this).removeAttr("id")})}}),e.extend(e.expr[":"],{data:e.expr.createPseudo?e.expr.createPseudo(function(t){return function(n){return!!e.data(n,t)}}):function(t,n,r){return!!e.data(t,r[3])},focusable:function(t){return i(t,!isNaN(e.attr(t,"tabindex")))},tabbable:function(t){var n=e.attr(t,"tabindex"),r=isNaN(n);return(r||n>=0)&&i(t,!r)}}),e("<a>").outerWidth(1).jquery||e.each(["Width","Height"],function(n,r){function u(t,n,r,s){return e.each(i,function(){n-=parseFloat(e.css(t,"padding"+this))||0,r&&(n-=parseFloat(e.css(t,"border"+this+"Width"))||0),s&&(n-=parseFloat(e.css(t,"margin"+this))||0)}),n}var i=r==="Width"?["Left","Right"]:["Top","Bottom"],s=r.toLowerCase(),o={innerWidth:e.fn.innerWidth,innerHeight:e.fn.innerHeight,outerWidth:e.fn.outerWidth,outerHeight:e.fn.outerHeight};e.fn["inner"+r]=function(n){return n===t?o["inner"+r].call(this):this.each(function(){e(this).css(s,u(this,n)+"px")})},e.fn["outer"+r]=function(t,n){return typeof t!="number"?o["outer"+r].call(this,t):this.each(function(){e(this).css(s,u(this,t,!0,n)+"px")})}}),e.fn.addBack||(e.fn.addBack=function(e){return this.add(e==null?this.prevObject:this.prevObject.filter(e))}),e("<a>").data("a-b","a").removeData("a-b").data("a-b")&&(e.fn.removeData=function(t){return function(n){return arguments.length?t.call(this,e.camelCase(n)):t.call(this)}}(e.fn.removeData)),e.ui.ie=!!/msie [\w.]+/.exec(navigator.userAgent.toLowerCase()),e.support.selectstart="onselectstart"in document.createElement("div"),e.fn.extend({disableSelection:function(){return this.bind((e.support.selectstart?"selectstart":"mousedown")+".ui-disableSelection",function(e){e.preventDefault()})},enableSelection:function(){return this.unbind(".ui-disableSelection")}}),e.extend(e.ui,{plugin:{add:function(t,n,r){var i,s=e.ui[t].prototype;for(i in r)s.plugins[i]=s.plugins[i]||[],s.plugins[i].push([n,r[i]])},call:function(e,t,n){var r,i=e.plugins[t];if(!i||!e.element[0].parentNode||e.element[0].parentNode.nodeType===11)return;for(r=0;r<i.length;r++)e.options[i[r][0]]&&i[r][1].apply(e.element,n)}},hasScroll:function(t,n){if(e(t).css("overflow")==="hidden")return!1;var r=n&&n==="left"?"scrollLeft":"scrollTop",i=!1;return t[r]>0?!0:(t[r]=1,i=t[r]>0,t[r]=0,i)}})})(jQuery);(function(e,t){var n=0,r=Array.prototype.slice,i=e.cleanData;e.cleanData=function(t){for(var n=0,r;(r=t[n])!=null;n++)try{e(r).triggerHandler("remove")}catch(s){}i(t)},e.widget=function(t,n,r){var i,s,o,u,a={},f=t.split(".")[0];t=t.split(".")[1],i=f+"-"+t,r||(r=n,n=e.Widget),e.expr[":"][i.toLowerCase()]=function(t){return!!e.data(t,i)},e[f]=e[f]||{},s=e[f][t],o=e[f][t]=function(e,t){if(!this._createWidget)return new o(e,t);arguments.length&&this._createWidget(e,t)},e.extend(o,s,{version:r.version,_proto:e.extend({},r),_childConstructors:[]}),u=new n,u.options=e.widget.extend({},u.options),e.each(r,function(t,r){if(!e.isFunction(r)){a[t]=r;return}a[t]=function(){var e=function(){return n.prototype[t].apply(this,arguments)},i=function(e){return n.prototype[t].apply(this,e)};return function(){var t=this._super,n=this._superApply,s;return this._super=e,this._superApply=i,s=r.apply(this,arguments),this._super=t,this._superApply=n,s}}()}),o.prototype=e.widget.extend(u,{widgetEventPrefix:s?u.widgetEventPrefix:t},a,{constructor:o,namespace:f,widgetName:t,widgetFullName:i}),s?(e.each(s._childConstructors,function(t,n){var r=n.prototype;e.widget(r.namespace+"."+r.widgetName,o,n._proto)}),delete s._childConstructors):n._childConstructors.push(o),e.widget.bridge(t,o)},e.widget.extend=function(n){var i=r.call(arguments,1),s=0,o=i.length,u,a;for(;s<o;s++)for(u in i[s])a=i[s][u],i[s].hasOwnProperty(u)&&a!==t&&(e.isPlainObject(a)?n[u]=e.isPlainObject(n[u])?e.widget.extend({},n[u],a):e.widget.extend({},a):n[u]=a);return n},e.widget.bridge=function(n,i){var s=i.prototype.widgetFullName||n;e.fn[n]=function(o){var u=typeof o=="string",a=r.call(arguments,1),f=this;return o=!u&&a.length?e.widget.extend.apply(null,[o].concat(a)):o,u?this.each(function(){var r,i=e.data(this,s);if(!i)return e.error("cannot call methods on "+n+" prior to initialization; "+"attempted to call method '"+o+"'");if(!e.isFunction(i[o])||o.charAt(0)==="_")return e.error("no such method '"+o+"' for "+n+" widget instance");r=i[o].apply(i,a);if(r!==i&&r!==t)return f=r&&r.jquery?f.pushStack(r.get()):r,!1}):this.each(function(){var t=e.data(this,s);t?t.option(o||{})._init():e.data(this,s,new i(o,this))}),f}},e.Widget=function(){},e.Widget._childConstructors=[],e.Widget.prototype={widgetName:"widget",widgetEventPrefix:"",defaultElement:"<div>",options:{disabled:!1,create:null},_createWidget:function(t,r){r=e(r||this.defaultElement||this)[0],this.element=e(r),this.uuid=n++,this.eventNamespace="."+this.widgetName+this.uuid,this.options=e.widget.extend({},this.options,this._getCreateOptions(),t),this.bindings=e(),this.hoverable=e(),this.focusable=e(),r!==this&&(e.data(r,this.widgetFullName,this),this._on(!0,this.element,{remove:function(e){e.target===r&&this.destroy()}}),this.document=e(r.style?r.ownerDocument:r.document||r),this.window=e(this.document[0].defaultView||this.document[0].parentWindow)),this._create(),this._trigger("create",null,this._getCreateEventData()),this._init()},_getCreateOptions:e.noop,_getCreateEventData:e.noop,_create:e.noop,_init:e.noop,destroy:function(){this._destroy(),this.element.unbind(this.eventNamespace).removeData(this.widgetName).removeData(this.widgetFullName).removeData(e.camelCase(this.widgetFullName)),this.widget().unbind(this.eventNamespace).removeAttr("aria-disabled").removeClass(this.widgetFullName+"-disabled "+"ui-state-disabled"),this.bindings.unbind(this.eventNamespace),this.hoverable.removeClass("ui-state-hover"),this.focusable.removeClass("ui-state-focus")},_destroy:e.noop,widget:function(){return this.element},option:function(n,r){var i=n,s,o,u;if(arguments.length===0)return e.widget.extend({},this.options);if(typeof n=="string"){i={},s=n.split("."),n=s.shift();if(s.length){o=i[n]=e.widget.extend({},this.options[n]);for(u=0;u<s.length-1;u++)o[s[u]]=o[s[u]]||{},o=o[s[u]];n=s.pop();if(r===t)return o[n]===t?null:o[n];o[n]=r}else{if(r===t)return this.options[n]===t?null:this.options[n];i[n]=r}}return this._setOptions(i),this},_setOptions:function(e){var t;for(t in e)this._setOption(t,e[t]);return this},_setOption:function(e,t){return this.options[e]=t,e==="disabled"&&(this.widget().toggleClass(this.widgetFullName+"-disabled ui-state-disabled",!!t).attr("aria-disabled",t),this.hoverable.removeClass("ui-state-hover"),this.focusable.removeClass("ui-state-focus")),this},enable:function(){return this._setOption("disabled",!1)},disable:function(){return this._setOption("disabled",!0)},_on:function(t,n,r){var i,s=this;typeof t!="boolean"&&(r=n,n=t,t=!1),r?(n=i=e(n),this.bindings=this.bindings.add(n)):(r=n,n=this.element,i=this.widget()),e.each(r,function(r,o){function u(){if(!t&&(s.options.disabled===!0||e(this).hasClass("ui-state-disabled")))return;return(typeof o=="string"?s[o]:o).apply(s,arguments)}typeof o!="string"&&(u.guid=o.guid=o.guid||u.guid||e.guid++);var a=r.match(/^(\w+)\s*(.*)$/),f=a[1]+s.eventNamespace,l=a[2];l?i.delegate(l,f,u):n.bind(f,u)})},_off:function(e,t){t=(t||"").split(" ").join(this.eventNamespace+" ")+this.eventNamespace,e.unbind(t).undelegate(t)},_delay:function(e,t){function n(){return(typeof e=="string"?r[e]:e).apply(r,arguments)}var r=this;return setTimeout(n,t||0)},_hoverable:function(t){this.hoverable=this.hoverable.add(t),this._on(t,{mouseenter:function(t){e(t.currentTarget).addClass("ui-state-hover")},mouseleave:function(t){e(t.currentTarget).removeClass("ui-state-hover")}})},_focusable:function(t){this.focusable=this.focusable.add(t),this._on(t,{focusin:function(t){e(t.currentTarget).addClass("ui-state-focus")},focusout:function(t){e(t.currentTarget).removeClass("ui-state-focus")}})},_trigger:function(t,n,r){var i,s,o=this.options[t];r=r||{},n=e.Event(n),n.type=(t===this.widgetEventPrefix?t:this.widgetEventPrefix+t).toLowerCase(),n.target=this.element[0],s=n.originalEvent;if(s)for(i in s)i in n||(n[i]=s[i]);return this.element.trigger(n,r),!(e.isFunction(o)&&o.apply(this.element[0],[n].concat(r))===!1||n.isDefaultPrevented())}},e.each({show:"fadeIn",hide:"fadeOut"},function(t,n){e.Widget.prototype["_"+t]=function(r,i,s){typeof i=="string"&&(i={effect:i});var o,u=i?i===!0||typeof i=="number"?n:i.effect||n:t;i=i||{},typeof i=="number"&&(i={duration:i}),o=!e.isEmptyObject(i),i.complete=s,i.delay&&r.delay(i.delay),o&&e.effects&&e.effects.effect[u]?r[t](i):u!==t&&r[u]?r[u](i.duration,i.easing,s):r.queue(function(n){e(this)[t](),s&&s.call(r[0]),n()})}})})(jQuery);(function(e,t){var n=!1;e(document).mouseup(function(){n=!1}),e.widget("ui.mouse",{version:"1.10.0",options:{cancel:"input,textarea,button,select,option",distance:1,delay:0},_mouseInit:function(){var t=this;this.element.bind("mousedown."+this.widgetName,function(e){return t._mouseDown(e)}).bind("click."+this.widgetName,function(n){if(!0===e.data(n.target,t.widgetName+".preventClickEvent"))return e.removeData(n.target,t.widgetName+".preventClickEvent"),n.stopImmediatePropagation(),!1}),this.started=!1},_mouseDestroy:function(){this.element.unbind("."+this.widgetName),this._mouseMoveDelegate&&e(document).unbind("mousemove."+this.widgetName,this._mouseMoveDelegate).unbind("mouseup."+this.widgetName,this._mouseUpDelegate)},_mouseDown:function(t){if(n)return;this._mouseStarted&&this._mouseUp(t),this._mouseDownEvent=t;var r=this,i=t.which===1,s=typeof this.options.cancel=="string"&&t.target.nodeName?e(t.target).closest(this.options.cancel).length:!1;if(!i||s||!this._mouseCapture(t))return!0;this.mouseDelayMet=!this.options.delay,this.mouseDelayMet||(this._mouseDelayTimer=setTimeout(function(){r.mouseDelayMet=!0},this.options.delay));if(this._mouseDistanceMet(t)&&this._mouseDelayMet(t)){this._mouseStarted=this._mouseStart(t)!==!1;if(!this._mouseStarted)return t.preventDefault(),!0}return!0===e.data(t.target,this.widgetName+".preventClickEvent")&&e.removeData(t.target,this.widgetName+".preventClickEvent"),this._mouseMoveDelegate=function(e){return r._mouseMove(e)},this._mouseUpDelegate=function(e){return r._mouseUp(e)},e(document).bind("mousemove."+this.widgetName,this._mouseMoveDelegate).bind("mouseup."+this.widgetName,this._mouseUpDelegate),t.preventDefault(),n=!0,!0},_mouseMove:function(t){return e.ui.ie&&(!document.documentMode||document.documentMode<9)&&!t.button?this._mouseUp(t):this._mouseStarted?(this._mouseDrag(t),t.preventDefault()):(this._mouseDistanceMet(t)&&this._mouseDelayMet(t)&&(this._mouseStarted=this._mouseStart(this._mouseDownEvent,t)!==!1,this._mouseStarted?this._mouseDrag(t):this._mouseUp(t)),!this._mouseStarted)},_mouseUp:function(t){return e(document).unbind("mousemove."+this.widgetName,this._mouseMoveDelegate).unbind("mouseup."+this.widgetName,this._mouseUpDelegate),this._mouseStarted&&(this._mouseStarted=!1,t.target===this._mouseDownEvent.target&&e.data(t.target,this.widgetName+".preventClickEvent",!0),this._mouseStop(t)),!1},_mouseDistanceMet:function(e){return Math.max(Math.abs(this._mouseDownEvent.pageX-e.pageX),Math.abs(this._mouseDownEvent.pageY-e.pageY))>=this.options.distance},_mouseDelayMet:function(){return this.mouseDelayMet},_mouseStart:function(){},_mouseDrag:function(){},_mouseStop:function(){},_mouseCapture:function(){return!0}})})(jQuery);(function(e,t){function h(e,t,n){return[parseInt(e[0],10)*(l.test(e[0])?t/100:1),parseInt(e[1],10)*(l.test(e[1])?n/100:1)]}function p(t,n){return parseInt(e.css(t,n),10)||0}function d(t){var n=t[0];return n.nodeType===9?{width:t.width(),height:t.height(),offset:{top:0,left:0}}:e.isWindow(n)?{width:t.width(),height:t.height(),offset:{top:t.scrollTop(),left:t.scrollLeft()}}:n.preventDefault?{width:0,height:0,offset:{top:n.pageY,left:n.pageX}}:{width:t.outerWidth(),height:t.outerHeight(),offset:t.offset()}}e.ui=e.ui||{};var n,r=Math.max,i=Math.abs,s=Math.round,o=/left|center|right/,u=/top|center|bottom/,a=/[\+\-]\d+%?/,f=/^\w+/,l=/%$/,c=e.fn.position;e.position={scrollbarWidth:function(){if(n!==t)return n;var r,i,s=e("<div style='display:block;width:50px;height:50px;overflow:hidden;'><div style='height:100px;width:auto;'></div></div>"),o=s.children()[0];return e("body").append(s),r=o.offsetWidth,s.css("overflow","scroll"),i=o.offsetWidth,r===i&&(i=s[0].clientWidth),s.remove(),n=r-i},getScrollInfo:function(t){var n=t.isWindow?"":t.element.css("overflow-x"),r=t.isWindow?"":t.element.css("overflow-y"),i=n==="scroll"||n==="auto"&&t.width<t.element[0].scrollWidth,s=r==="scroll"||r==="auto"&&t.height<t.element[0].scrollHeight;return{width:i?e.position.scrollbarWidth():0,height:s?e.position.scrollbarWidth():0}},getWithinInfo:function(t){var n=e(t||window),r=e.isWindow(n[0]);return{element:n,isWindow:r,offset:n.offset()||{left:0,top:0},scrollLeft:n.scrollLeft(),scrollTop:n.scrollTop(),width:r?n.width():n.outerWidth(),height:r?n.height():n.outerHeight()}}},e.fn.position=function(t){if(!t||!t.of)return c.apply(this,arguments);t=e.extend({},t);var n,l,v,m,g,y,b=e(t.of),w=e.position.getWithinInfo(t.within),E=e.position.getScrollInfo(w),S=(t.collision||"flip").split(" "),x={};return y=d(b),b[0].preventDefault&&(t.at="left top"),l=y.width,v=y.height,m=y.offset,g=e.extend({},m),e.each(["my","at"],function(){var e=(t[this]||"").split(" "),n,r;e.length===1&&(e=o.test(e[0])?e.concat(["center"]):u.test(e[0])?["center"].concat(e):["center","center"]),e[0]=o.test(e[0])?e[0]:"center",e[1]=u.test(e[1])?e[1]:"center",n=a.exec(e[0]),r=a.exec(e[1]),x[this]=[n?n[0]:0,r?r[0]:0],t[this]=[f.exec(e[0])[0],f.exec(e[1])[0]]}),S.length===1&&(S[1]=S[0]),t.at[0]==="right"?g.left+=l:t.at[0]==="center"&&(g.left+=l/2),t.at[1]==="bottom"?g.top+=v:t.at[1]==="center"&&(g.top+=v/2),n=h(x.at,l,v),g.left+=n[0],g.top+=n[1],this.each(function(){var o,u,a=e(this),f=a.outerWidth(),c=a.outerHeight(),d=p(this,"marginLeft"),y=p(this,"marginTop"),T=f+d+p(this,"marginRight")+E.width,N=c+y+p(this,"marginBottom")+E.height,C=e.extend({},g),k=h(x.my,a.outerWidth(),a.outerHeight());t.my[0]==="right"?C.left-=f:t.my[0]==="center"&&(C.left-=f/2),t.my[1]==="bottom"?C.top-=c:t.my[1]==="center"&&(C.top-=c/2),C.left+=k[0],C.top+=k[1],e.support.offsetFractions||(C.left=s(C.left),C.top=s(C.top)),o={marginLeft:d,marginTop:y},e.each(["left","top"],function(r,i){e.ui.position[S[r]]&&e.ui.position[S[r]][i](C,{targetWidth:l,targetHeight:v,elemWidth:f,elemHeight:c,collisionPosition:o,collisionWidth:T,collisionHeight:N,offset:[n[0]+k[0],n[1]+k[1]],my:t.my,at:t.at,within:w,elem:a})}),t.using&&(u=function(e){var n=m.left-C.left,s=n+l-f,o=m.top-C.top,u=o+v-c,h={target:{element:b,left:m.left,top:m.top,width:l,height:v},element:{element:a,left:C.left,top:C.top,width:f,height:c},horizontal:s<0?"left":n>0?"right":"center",vertical:u<0?"top":o>0?"bottom":"middle"};l<f&&i(n+s)<l&&(h.horizontal="center"),v<c&&i(o+u)<v&&(h.vertical="middle"),r(i(n),i(s))>r(i(o),i(u))?h.important="horizontal":h.important="vertical",t.using.call(this,e,h)}),a.offset(e.extend(C,{using:u}))})},e.ui.position={fit:{left:function(e,t){var n=t.within,i=n.isWindow?n.scrollLeft:n.offset.left,s=n.width,o=e.left-t.collisionPosition.marginLeft,u=i-o,a=o+t.collisionWidth-s-i,f;t.collisionWidth>s?u>0&&a<=0?(f=e.left+u+t.collisionWidth-s-i,e.left+=u-f):a>0&&u<=0?e.left=i:u>a?e.left=i+s-t.collisionWidth:e.left=i:u>0?e.left+=u:a>0?e.left-=a:e.left=r(e.left-o,e.left)},top:function(e,t){var n=t.within,i=n.isWindow?n.scrollTop:n.offset.top,s=t.within.height,o=e.top-t.collisionPosition.marginTop,u=i-o,a=o+t.collisionHeight-s-i,f;t.collisionHeight>s?u>0&&a<=0?(f=e.top+u+t.collisionHeight-s-i,e.top+=u-f):a>0&&u<=0?e.top=i:u>a?e.top=i+s-t.collisionHeight:e.top=i:u>0?e.top+=u:a>0?e.top-=a:e.top=r(e.top-o,e.top)}},flip:{left:function(e,t){var n=t.within,r=n.offset.left+n.scrollLeft,s=n.width,o=n.isWindow?n.scrollLeft:n.offset.left,u=e.left-t.collisionPosition.marginLeft,a=u-o,f=u+t.collisionWidth-s-o,l=t.my[0]==="left"?-t.elemWidth:t.my[0]==="right"?t.elemWidth:0,c=t.at[0]==="left"?t.targetWidth:t.at[0]==="right"?-t.targetWidth:0,h=-2*t.offset[0],p,d;if(a<0){p=e.left+l+c+h+t.collisionWidth-s-r;if(p<0||p<i(a))e.left+=l+c+h}else if(f>0){d=e.left-t.collisionPosition.marginLeft+l+c+h-o;if(d>0||i(d)<f)e.left+=l+c+h}},top:function(e,t){var n=t.within,r=n.offset.top+n.scrollTop,s=n.height,o=n.isWindow?n.scrollTop:n.offset.top,u=e.top-t.collisionPosition.marginTop,a=u-o,f=u+t.collisionHeight-s-o,l=t.my[1]==="top",c=l?-t.elemHeight:t.my[1]==="bottom"?t.elemHeight:0,h=t.at[1]==="top"?t.targetHeight:t.at[1]==="bottom"?-t.targetHeight:0,p=-2*t.offset[1],d,v;a<0?(v=e.top+c+h+p+t.collisionHeight-s-r,e.top+c+h+p>a&&(v<0||v<i(a))&&(e.top+=c+h+p)):f>0&&(d=e.top-t.collisionPosition.marginTop+c+h+p-o,e.top+c+h+p>f&&(d>0||i(d)<f)&&(e.top+=c+h+p))}},flipfit:{left:function(){e.ui.position.flip.left.apply(this,arguments),e.ui.position.fit.left.apply(this,arguments)},top:function(){e.ui.position.flip.top.apply(this,arguments),e.ui.position.fit.top.apply(this,arguments)}}},function(){var t,n,r,i,s,o=document.getElementsByTagName("body")[0],u=document.createElement("div");t=document.createElement(o?"div":"body"),r={visibility:"hidden",width:0,height:0,border:0,margin:0,background:"none"},o&&e.extend(r,{position:"absolute",left:"-1000px",top:"-1000px"});for(s in r)t.style[s]=r[s];t.appendChild(u),n=o||document.documentElement,n.insertBefore(t,n.firstChild),u.style.cssText="position: absolute; left: 10.7432222px;",i=e(u).offset().left,e.support.offsetFractions=i>10&&i<11,t.innerHTML="",n.removeChild(t)}()})(jQuery);(function(e,t){e.widget("ui.draggable",e.ui.mouse,{version:"1.10.0",widgetEventPrefix:"drag",options:{addClasses:!0,appendTo:"parent",axis:!1,connectToSortable:!1,containment:!1,cursor:"auto",cursorAt:!1,grid:!1,handle:!1,helper:"original",iframeFix:!1,opacity:!1,refreshPositions:!1,revert:!1,revertDuration:500,scope:"default",scroll:!0,scrollSensitivity:20,scrollSpeed:20,snap:!1,snapMode:"both",snapTolerance:20,stack:!1,zIndex:!1,drag:null,start:null,stop:null},_create:function(){this.options.helper==="original"&&!/^(?:r|a|f)/.test(this.element.css("position"))&&(this.element[0].style.position="relative"),this.options.addClasses&&this.element.addClass("ui-draggable"),this.options.disabled&&this.element.addClass("ui-draggable-disabled"),this._mouseInit()},_destroy:function(){this.element.removeClass("ui-draggable ui-draggable-dragging ui-draggable-disabled"),this._mouseDestroy()},_mouseCapture:function(t){var n=this.options;return this.helper||n.disabled||e(t.target).closest(".ui-resizable-handle").length>0?!1:(this.handle=this._getHandle(t),this.handle?(e(n.iframeFix===!0?"iframe":n.iframeFix).each(function(){e("<div class='ui-draggable-iframeFix' style='background: #fff;'></div>").css({width:this.offsetWidth+"px",height:this.offsetHeight+"px",position:"absolute",opacity:"0.001",zIndex:1e3}).css(e(this).offset()).appendTo("body")}),!0):!1)},_mouseStart:function(t){var n=this.options;return this.helper=this._createHelper(t),this.helper.addClass("ui-draggable-dragging"),this._cacheHelperProportions(),e.ui.ddmanager&&(e.ui.ddmanager.current=this),this._cacheMargins(),this.cssPosition=this.helper.css("position"),this.scrollParent=this.helper.scrollParent(),this.offset=this.positionAbs=this.element.offset(),this.offset={top:this.offset.top-this.margins.top,left:this.offset.left-this.margins.left},e.extend(this.offset,{click:{left:t.pageX-this.offset.left,top:t.pageY-this.offset.top},parent:this._getParentOffset(),relative:this._getRelativeOffset()}),this.originalPosition=this.position=this._generatePosition(t),this.originalPageX=t.pageX,this.originalPageY=t.pageY,n.cursorAt&&this._adjustOffsetFromHelper(n.cursorAt),n.containment&&this._setContainment(),this._trigger("start",t)===!1?(this._clear(),!1):(this._cacheHelperProportions(),e.ui.ddmanager&&!n.dropBehaviour&&e.ui.ddmanager.prepareOffsets(this,t),this._mouseDrag(t,!0),e.ui.ddmanager&&e.ui.ddmanager.dragStart(this,t),!0)},_mouseDrag:function(t,n){this.position=this._generatePosition(t),this.positionAbs=this._convertPositionTo("absolute");if(!n){var r=this._uiHash();if(this._trigger("drag",t,r)===!1)return this._mouseUp({}),!1;this.position=r.position}if(!this.options.axis||this.options.axis!=="y")this.helper[0].style.left=this.position.left+"px";if(!this.options.axis||this.options.axis!=="x")this.helper[0].style.top=this.position.top+"px";return e.ui.ddmanager&&e.ui.ddmanager.drag(this,t),!1},_mouseStop:function(t){var n,r=this,i=!1,s=!1;e.ui.ddmanager&&!this.options.dropBehaviour&&(s=e.ui.ddmanager.drop(this,t)),this.dropped&&(s=this.dropped,this.dropped=!1),n=this.element[0];while(n&&(n=n.parentNode))n===document&&(i=!0);return!i&&this.options.helper==="original"?!1:(this.options.revert==="invalid"&&!s||this.options.revert==="valid"&&s||this.options.revert===!0||e.isFunction(this.options.revert)&&this.options.revert.call(this.element,s)?e(this.helper).animate(this.originalPosition,parseInt(this.options.revertDuration,10),function(){r._trigger("stop",t)!==!1&&r._clear()}):this._trigger("stop",t)!==!1&&this._clear(),!1)},_mouseUp:function(t){return e("div.ui-draggable-iframeFix").each(function(){this.parentNode.removeChild(this)}),e.ui.ddmanager&&e.ui.ddmanager.dragStop(this,t),e.ui.mouse.prototype._mouseUp.call(this,t)},cancel:function(){return this.helper.is(".ui-draggable-dragging")?this._mouseUp({}):this._clear(),this},_getHandle:function(t){var n=!this.options.handle||!e(this.options.handle,this.element).length?!0:!1;return e(this.options.handle,this.element).find("*").addBack().each(function(){this===t.target&&(n=!0)}),n},_createHelper:function(t){var n=this.options,r=e.isFunction(n.helper)?e(n.helper.apply(this.element[0],[t])):n.helper==="clone"?this.element.clone().removeAttr("id"):this.element;return r.parents("body").length||r.appendTo(n.appendTo==="parent"?this.element[0].parentNode:n.appendTo),r[0]!==this.element[0]&&!/(fixed|absolute)/.test(r.css("position"))&&r.css("position","absolute"),r},_adjustOffsetFromHelper:function(t){typeof t=="string"&&(t=t.split(" ")),e.isArray(t)&&(t={left:+t[0],top:+t[1]||0}),"left"in t&&(this.offset.click.left=t.left+this.margins.left),"right"in t&&(this.offset.click.left=this.helperProportions.width-t.right+this.margins.left),"top"in t&&(this.offset.click.top=t.top+this.margins.top),"bottom"in t&&(this.offset.click.top=this.helperProportions.height-t.bottom+this.margins.top)},_getParentOffset:function(){this.offsetParent=this.helper.offsetParent();var t=this.offsetParent.offset();this.cssPosition==="absolute"&&this.scrollParent[0]!==document&&e.contains(this.scrollParent[0],this.offsetParent[0])&&(t.left+=this.scrollParent.scrollLeft(),t.top+=this.scrollParent.scrollTop());if(this.offsetParent[0]===document.body||this.offsetParent[0].tagName&&this.offsetParent[0].tagName.toLowerCase()==="html"&&e.ui.ie)t={top:0,left:0};return{top:t.top+(parseInt(this.offsetParent.css("borderTopWidth"),10)||0),left:t.left+(parseInt(this.offsetParent.css("borderLeftWidth"),10)||0)}},_getRelativeOffset:function(){if(this.cssPosition==="relative"){var e=this.element.position();return{top:e.top-(parseInt(this.helper.css("top"),10)||0)+this.scrollParent.scrollTop(),left:e.left-(parseInt(this.helper.css("left"),10)||0)+this.scrollParent.scrollLeft()}}return{top:0,left:0}},_cacheMargins:function(){this.margins={left:parseInt(this.element.css("marginLeft"),10)||0,top:parseInt(this.element.css("marginTop"),10)||0,right:parseInt(this.element.css("marginRight"),10)||0,bottom:parseInt(this.element.css("marginBottom"),10)||0}},_cacheHelperProportions:function(){this.helperProportions={width:this.helper.outerWidth(),height:this.helper.outerHeight()}},_setContainment:function(){var t,n,r,i=this.options;i.containment==="parent"&&(i.containment=this.helper[0].parentNode);if(i.containment==="document"||i.containment==="window")this.containment=[i.containment==="document"?0:e(window).scrollLeft()-this.offset.relative.left-this.offset.parent.left,i.containment==="document"?0:e(window).scrollTop()-this.offset.relative.top-this.offset.parent.top,(i.containment==="document"?0:e(window).scrollLeft())+e(i.containment==="document"?document:window).width()-this.helperProportions.width-this.margins.left,(i.containment==="document"?0:e(window).scrollTop())+(e(i.containment==="document"?document:window).height()||document.body.parentNode.scrollHeight)-this.helperProportions.height-this.margins.top];if(!/^(document|window|parent)$/.test(i.containment)&&i.containment.constructor!==Array){n=e(i.containment),r=n[0];if(!r)return;t=e(r).css("overflow")!=="hidden",this.containment=[(parseInt(e(r).css("borderLeftWidth"),10)||0)+(parseInt(e(r).css("paddingLeft"),10)||0),(parseInt(e(r).css("borderTopWidth"),10)||0)+(parseInt(e(r).css("paddingTop"),10)||0),(t?Math.max(r.scrollWidth,r.offsetWidth):r.offsetWidth)-(parseInt(e(r).css("borderLeftWidth"),10)||0)-(parseInt(e(r).css("paddingRight"),10)||0)-this.helperProportions.width-this.margins.left-this.margins.right,(t?Math.max(r.scrollHeight,r.offsetHeight):r.offsetHeight)-(parseInt(e(r).css("borderTopWidth"),10)||0)-(parseInt(e(r).css("paddingBottom"),10)||0)-this.helperProportions.height-this.margins.top-this.margins.bottom],this.relative_container=n}else i.containment.constructor===Array&&(this.containment=i.containment)},_convertPositionTo:function(t,n){n||(n=this.position);var r=t==="absolute"?1:-1,i=this.cssPosition!=="absolute"||this.scrollParent[0]!==document&&!!e.contains(this.scrollParent[0],this.offsetParent[0])?this.scrollParent:this.offsetParent,s=/(html|body)/i.test(i[0].tagName);return{top:n.top+this.offset.relative.top*r+this.offset.parent.top*r-(this.cssPosition==="fixed"?-this.scrollParent.scrollTop():s?0:i.scrollTop())*r,left:n.left+this.offset.relative.left*r+this.offset.parent.left*r-(this.cssPosition==="fixed"?-this.scrollParent.scrollLeft():s?0:i.scrollLeft())*r}},_generatePosition:function(t){var n,r,i,s,o=this.options,u=this.cssPosition!=="absolute"||this.scrollParent[0]!==document&&!!e.contains(this.scrollParent[0],this.offsetParent[0])?this.scrollParent:this.offsetParent,a=/(html|body)/i.test(u[0].tagName),f=t.pageX,l=t.pageY;return this.originalPosition&&(this.containment&&(this.relative_container?(r=this.relative_container.offset(),n=[this.containment[0]+r.left,this.containment[1]+r.top,this.containment[2]+r.left,this.containment[3]+r.top]):n=this.containment,t.pageX-this.offset.click.left<n[0]&&(f=n[0]+this.offset.click.left),t.pageY-this.offset.click.top<n[1]&&(l=n[1]+this.offset.click.top),t.pageX-this.offset.click.left>n[2]&&(f=n[2]+this.offset.click.left),t.pageY-this.offset.click.top>n[3]&&(l=n[3]+this.offset.click.top)),o.grid&&(i=o.grid[1]?this.originalPageY+Math.round((l-this.originalPageY)/o.grid[1])*o.grid[1]:this.originalPageY,l=n?i-this.offset.click.top>=n[1]||i-this.offset.click.top>n[3]?i:i-this.offset.click.top>=n[1]?i-o.grid[1]:i+o.grid[1]:i,s=o.grid[0]?this.originalPageX+Math.round((f-this.originalPageX)/o.grid[0])*o.grid[0]:this.originalPageX,f=n?s-this.offset.click.left>=n[0]||s-this.offset.click.left>n[2]?s:s-this.offset.click.left>=n[0]?s-o.grid[0]:s+o.grid[0]:s)),{top:l-this.offset.click.top-this.offset.relative.top-this.offset.parent.top+(this.cssPosition==="fixed"?-this.scrollParent.scrollTop():a?0:u.scrollTop()),left:f-this.offset.click.left-this.offset.relative.left-this.offset.parent.left+(this.cssPosition==="fixed"?-this.scrollParent.scrollLeft():a?0:u.scrollLeft())}},_clear:function(){this.helper.removeClass("ui-draggable-dragging"),this.helper[0]!==this.element[0]&&!this.cancelHelperRemoval&&this.helper.remove(),this.helper=null,this.cancelHelperRemoval=!1},_trigger:function(t,n,r){return r=r||this._uiHash(),e.ui.plugin.call(this,t,[n,r]),t==="drag"&&(this.positionAbs=this._convertPositionTo("absolute")),e.Widget.prototype._trigger.call(this,t,n,r)},plugins:{},_uiHash:function(){return{helper:this.helper,position:this.position,originalPosition:this.originalPosition,offset:this.positionAbs}}}),e.ui.plugin.add("draggable","connectToSortable",{start:function(t,n){var r=e(this).data("ui-draggable"),i=r.options,s=e.extend({},n,{item:r.element});r.sortables=[],e(i.connectToSortable).each(function(){var n=e.data(this,"ui-sortable");n&&!n.options.disabled&&(r.sortables.push({instance:n,shouldRevert:n.options.revert}),n.refreshPositions(),n._trigger("activate",t,s))})},stop:function(t,n){var r=e(this).data("ui-draggable"),i=e.extend({},n,{item:r.element});e.each(r.sortables,function(){this.instance.isOver?(this.instance.isOver=0,r.cancelHelperRemoval=!0,this.instance.cancelHelperRemoval=!1,this.shouldRevert&&(this.instance.options.revert=!0),this.instance._mouseStop(t),this.instance.options.helper=this.instance.options._helper,r.options.helper==="original"&&this.instance.currentItem.css({top:"auto",left:"auto"})):(this.instance.cancelHelperRemoval=!1,this.instance._trigger("deactivate",t,i))})},drag:function(t,n){var r=e(this).data("ui-draggable"),i=this;e.each(r.sortables,function(){var s=!1,o=this;this.instance.positionAbs=r.positionAbs,this.instance.helperProportions=r.helperProportions,this.instance.offset.click=r.offset.click,this.instance._intersectsWith(this.instance.containerCache)&&(s=!0,e.each(r.sortables,function(){return this.instance.positionAbs=r.positionAbs,this.instance.helperProportions=r.helperProportions,this.instance.offset.click=r.offset.click,this!==o&&this.instance._intersectsWith(this.instance.containerCache)&&e.ui.contains(o.instance.element[0],this.instance.element[0])&&(s=!1),s})),s?(this.instance.isOver||(this.instance.isOver=1,this.instance.currentItem=e(i).clone().removeAttr("id").appendTo(this.instance.element).data("ui-sortable-item",!0),this.instance.options._helper=this.instance.options.helper,this.instance.options.helper=function(){return n.helper[0]},t.target=this.instance.currentItem[0],this.instance._mouseCapture(t,!0),this.instance._mouseStart(t,!0,!0),this.instance.offset.click.top=r.offset.click.top,this.instance.offset.click.left=r.offset.click.left,this.instance.offset.parent.left-=r.offset.parent.left-this.instance.offset.parent.left,this.instance.offset.parent.top-=r.offset.parent.top-this.instance.offset.parent.top,r._trigger("toSortable",t),r.dropped=this.instance.element,r.currentItem=r.element,this.instance.fromOutside=r),this.instance.currentItem&&this.instance._mouseDrag(t)):this.instance.isOver&&(this.instance.isOver=0,this.instance.cancelHelperRemoval=!0,this.instance.options.revert=!1,this.instance._trigger("out",t,this.instance._uiHash(this.instance)),this.instance._mouseStop(t,!0),this.instance.options.helper=this.instance.options._helper,this.instance.currentItem.remove(),this.instance.placeholder&&this.instance.placeholder.remove(),r._trigger("fromSortable",t),r.dropped=!1)})}}),e.ui.plugin.add("draggable","cursor",{start:function(){var t=e("body"),n=e(this).data("ui-draggable").options;t.css("cursor")&&(n._cursor=t.css("cursor")),t.css("cursor",n.cursor)},stop:function(){var t=e(this).data("ui-draggable").options;t._cursor&&e("body").css("cursor",t._cursor)}}),e.ui.plugin.add("draggable","opacity",{start:function(t,n){var r=e(n.helper),i=e(this).data("ui-draggable").options;r.css("opacity")&&(i._opacity=r.css("opacity")),r.css("opacity",i.opacity)},stop:function(t,n){var r=e(this).data("ui-draggable").options;r._opacity&&e(n.helper).css("opacity",r._opacity)}}),e.ui.plugin.add("draggable","scroll",{start:function(){var t=e(this).data("ui-draggable");t.scrollParent[0]!==document&&t.scrollParent[0].tagName!=="HTML"&&(t.overflowOffset=t.scrollParent.offset())},drag:function(t){var n=e(this).data("ui-draggable"),r=n.options,i=!1;if(n.scrollParent[0]!==document&&n.scrollParent[0].tagName!=="HTML"){if(!r.axis||r.axis!=="x")n.overflowOffset.top+n.scrollParent[0].offsetHeight-t.pageY<r.scrollSensitivity?n.scrollParent[0].scrollTop=i=n.scrollParent[0].scrollTop+r.scrollSpeed:t.pageY-n.overflowOffset.top<r.scrollSensitivity&&(n.scrollParent[0].scrollTop=i=n.scrollParent[0].scrollTop-r.scrollSpeed);if(!r.axis||r.axis!=="y")n.overflowOffset.left+n.scrollParent[0].offsetWidth-t.pageX<r.scrollSensitivity?n.scrollParent[0].scrollLeft=i=n.scrollParent[0].scrollLeft+r.scrollSpeed:t.pageX-n.overflowOffset.left<r.scrollSensitivity&&(n.scrollParent[0].scrollLeft=i=n.scrollParent[0].scrollLeft-r.scrollSpeed)}else{if(!r.axis||r.axis!=="x")t.pageY-e(document).scrollTop()<r.scrollSensitivity?i=e(document).scrollTop(e(document).scrollTop()-r.scrollSpeed):e(window).height()-(t.pageY-e(document).scrollTop())<r.scrollSensitivity&&(i=e(document).scrollTop(e(document).scrollTop()+r.scrollSpeed));if(!r.axis||r.axis!=="y")t.pageX-e(document).scrollLeft()<r.scrollSensitivity?i=e(document).scrollLeft(e(document).scrollLeft()-r.scrollSpeed):e(window).width()-(t.pageX-e(document).scrollLeft())<r.scrollSensitivity&&(i=e(document).scrollLeft(e(document).scrollLeft()+r.scrollSpeed))}i!==!1&&e.ui.ddmanager&&!r.dropBehaviour&&e.ui.ddmanager.prepareOffsets(n,t)}}),e.ui.plugin.add("draggable","snap",{start:function(){var t=e(this).data("ui-draggable"),n=t.options;t.snapElements=[],e(n.snap.constructor!==String?n.snap.items||":data(ui-draggable)":n.snap).each(function(){var n=e(this),r=n.offset();this!==t.element[0]&&t.snapElements.push({item:this,width:n.outerWidth(),height:n.outerHeight(),top:r.top,left:r.left})})},drag:function(t,n){var r,i,s,o,u,a,f,l,c,h,p=e(this).data("ui-draggable"),d=p.options,v=d.snapTolerance,m=n.offset.left,g=m+p.helperProportions.width,y=n.offset.top,b=y+p.helperProportions.height;for(c=p.snapElements.length-1;c>=0;c--){u=p.snapElements[c].left,a=u+p.snapElements[c].width,f=p.snapElements[c].top,l=f+p.snapElements[c].height;if(!(u-v<m&&m<a+v&&f-v<y&&y<l+v||u-v<m&&m<a+v&&f-v<b&&b<l+v||u-v<g&&g<a+v&&f-v<y&&y<l+v||u-v<g&&g<a+v&&f-v<b&&b<l+v)){p.snapElements[c].snapping&&p.options.snap.release&&p.options.snap.release.call(p.element,t,e.extend(p._uiHash(),{snapItem:p.snapElements[c].item})),p.snapElements[c].snapping=!1;continue}d.snapMode!=="inner"&&(r=Math.abs(f-b)<=v,i=Math.abs(l-y)<=v,s=Math.abs(u-g)<=v,o=Math.abs(a-m)<=v,r&&(n.position.top=p._convertPositionTo("relative",{top:f-p.helperProportions.height,left:0}).top-p.margins.top),i&&(n.position.top=p._convertPositionTo("relative",{top:l,left:0}).top-p.margins.top),s&&(n.position.left=p._convertPositionTo("relative",{top:0,left:u-p.helperProportions.width}).left-p.margins.left),o&&(n.position.left=p._convertPositionTo("relative",{top:0,left:a}).left-p.margins.left)),h=r||i||s||o,d.snapMode!=="outer"&&(r=Math.abs(f-y)<=v,i=Math.abs(l-b)<=v,s=Math.abs(u-m)<=v,o=Math.abs(a-g)<=v,r&&(n.position.top=p._convertPositionTo("relative",{top:f,left:0}).top-p.margins.top),i&&(n.position.top=p._convertPositionTo("relative",{top:l-p.helperProportions.height,left:0}).top-p.margins.top),s&&(n.position.left=p._convertPositionTo("relative",{top:0,left:u}).left-p.margins.left),o&&(n.position.left=p._convertPositionTo("relative",{top:0,left:a-p.helperProportions.width}).left-p.margins.left)),!p.snapElements[c].snapping&&(r||i||s||o||h)&&p.options.snap.snap&&p.options.snap.snap.call(p.element,t,e.extend(p._uiHash(),{snapItem:p.snapElements[c].item})),p.snapElements[c].snapping=r||i||s||o||h}}}),e.ui.plugin.add("draggable","stack",{start:function(){var t,n=e(this).data("ui-draggable").options,r=e.makeArray(e(n.stack)).sort(function(t,n){return(parseInt(e(t).css("zIndex"),10)||0)-(parseInt(e(n).css("zIndex"),10)||0)});if(!r.length)return;t=parseInt(r[0].style.zIndex,10)||0,e(r).each(function(e){this.style.zIndex=t+e}),this[0].style.zIndex=t+r.length}}),e.ui.plugin.add("draggable","zIndex",{start:function(t,n){var r=e(n.helper),i=e(this).data("ui-draggable").options;r.css("zIndex")&&(i._zIndex=r.css("zIndex")),r.css("zIndex",i.zIndex)},stop:function(t,n){var r=e(this).data("ui-draggable").options;r._zIndex&&e(n.helper).css("zIndex",r._zIndex)}})})(jQuery);jQuery.effects||function(e,t){var n="ui-effects-";e.effects={effect:{}},function(e,t){function h(e,t,n){var r=u[t.type]||{};return e==null?n||!t.def?null:t.def:(e=r.floor?~~e:parseFloat(e),isNaN(e)?t.def:r.mod?(e+r.mod)%r.mod:0>e?0:r.max<e?r.max:e)}function p(t){var n=s(),r=n._rgba=[];return t=t.toLowerCase(),c(i,function(e,i){var s,u=i.re.exec(t),a=u&&i.parse(u),f=i.space||"rgba";if(a)return s=n[f](a),n[o[f].cache]=s[o[f].cache],r=n._rgba=s._rgba,!1}),r.length?(r.join()==="0,0,0,0"&&e.extend(r,l.transparent),n):l[t]}function d(e,t,n){return n=(n+1)%1,n*6<1?e+(t-e)*n*6:n*2<1?t:n*3<2?e+(t-e)*(2/3-n)*6:e}var n="backgroundColor borderBottomColor borderLeftColor borderRightColor borderTopColor color columnRuleColor outlineColor textDecorationColor textEmphasisColor",r=/^([\-+])=\s*(\d+\.?\d*)/,i=[{re:/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d?(?:\.\d+)?)\s*)?\)/,parse:function(e){return[e[1],e[2],e[3],e[4]]}},{re:/rgba?\(\s*(\d+(?:\.\d+)?)\%\s*,\s*(\d+(?:\.\d+)?)\%\s*,\s*(\d+(?:\.\d+)?)\%\s*(?:,\s*(\d?(?:\.\d+)?)\s*)?\)/,parse:function(e){return[e[1]*2.55,e[2]*2.55,e[3]*2.55,e[4]]}},{re:/#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})/,parse:function(e){return[parseInt(e[1],16),parseInt(e[2],16),parseInt(e[3],16)]}},{re:/#([a-f0-9])([a-f0-9])([a-f0-9])/,parse:function(e){return[parseInt(e[1]+e[1],16),parseInt(e[2]+e[2],16),parseInt(e[3]+e[3],16)]}},{re:/hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\%\s*,\s*(\d+(?:\.\d+)?)\%\s*(?:,\s*(\d?(?:\.\d+)?)\s*)?\)/,space:"hsla",parse:function(e){return[e[1],e[2]/100,e[3]/100,e[4]]}}],s=e.Color=function(t,n,r,i){return new e.Color.fn.parse(t,n,r,i)},o={rgba:{props:{red:{idx:0,type:"byte"},green:{idx:1,type:"byte"},blue:{idx:2,type:"byte"}}},hsla:{props:{hue:{idx:0,type:"degrees"},saturation:{idx:1,type:"percent"},lightness:{idx:2,type:"percent"}}}},u={"byte":{floor:!0,max:255},percent:{max:1},degrees:{mod:360,floor:!0}},a=s.support={},f=e("<p>")[0],l,c=e.each;f.style.cssText="background-color:rgba(1,1,1,.5)",a.rgba=f.style.backgroundColor.indexOf("rgba")>-1,c(o,function(e,t){t.cache="_"+e,t.props.alpha={idx:3,type:"percent",def:1}}),s.fn=e.extend(s.prototype,{parse:function(n,r,i,u){if(n===t)return this._rgba=[null,null,null,null],this;if(n.jquery||n.nodeType)n=e(n).css(r),r=t;var a=this,f=e.type(n),d=this._rgba=[];r!==t&&(n=[n,r,i,u],f="array");if(f==="string")return this.parse(p(n)||l._default);if(f==="array")return c(o.rgba.props,function(e,t){d[t.idx]=h(n[t.idx],t)}),this;if(f==="object")return n instanceof s?c(o,function(e,t){n[t.cache]&&(a[t.cache]=n[t.cache].slice())}):c(o,function(t,r){var i=r.cache;c(r.props,function(e,t){if(!a[i]&&r.to){if(e==="alpha"||n[e]==null)return;a[i]=r.to(a._rgba)}a[i][t.idx]=h(n[e],t,!0)}),a[i]&&e.inArray(null,a[i].slice(0,3))<0&&(a[i][3]=1,r.from&&(a._rgba=r.from(a[i])))}),this},is:function(e){var t=s(e),n=!0,r=this;return c(o,function(e,i){var s,o=t[i.cache];return o&&(s=r[i.cache]||i.to&&i.to(r._rgba)||[],c(i.props,function(e,t){if(o[t.idx]!=null)return n=o[t.idx]===s[t.idx],n})),n}),n},_space:function(){var e=[],t=this;return c(o,function(n,r){t[r.cache]&&e.push(n)}),e.pop()},transition:function(e,t){var n=s(e),r=n._space(),i=o[r],a=this.alpha()===0?s("transparent"):this,f=a[i.cache]||i.to(a._rgba),l=f.slice();return n=n[i.cache],c(i.props,function(e,r){var i=r.idx,s=f[i],o=n[i],a=u[r.type]||{};if(o===null)return;s===null?l[i]=o:(a.mod&&(o-s>a.mod/2?s+=a.mod:s-o>a.mod/2&&(s-=a.mod)),l[i]=h((o-s)*t+s,r))}),this[r](l)},blend:function(t){if(this._rgba[3]===1)return this;var n=this._rgba.slice(),r=n.pop(),i=s(t)._rgba;return s(e.map(n,function(e,t){return(1-r)*i[t]+r*e}))},toRgbaString:function(){var t="rgba(",n=e.map(this._rgba,function(e,t){return e==null?t>2?1:0:e});return n[3]===1&&(n.pop(),t="rgb("),t+n.join()+")"},toHslaString:function(){var t="hsla(",n=e.map(this.hsla(),function(e,t){return e==null&&(e=t>2?1:0),t&&t<3&&(e=Math.round(e*100)+"%"),e});return n[3]===1&&(n.pop(),t="hsl("),t+n.join()+")"},toHexString:function(t){var n=this._rgba.slice(),r=n.pop();return t&&n.push(~~(r*255)),"#"+e.map(n,function(e){return e=(e||0).toString(16),e.length===1?"0"+e:e}).join("")},toString:function(){return this._rgba[3]===0?"transparent":this.toRgbaString()}}),s.fn.parse.prototype=s.fn,o.hsla.to=function(e){if(e[0]==null||e[1]==null||e[2]==null)return[null,null,null,e[3]];var t=e[0]/255,n=e[1]/255,r=e[2]/255,i=e[3],s=Math.max(t,n,r),o=Math.min(t,n,r),u=s-o,a=s+o,f=a*.5,l,c;return o===s?l=0:t===s?l=60*(n-r)/u+360:n===s?l=60*(r-t)/u+120:l=60*(t-n)/u+240,u===0?c=0:f<=.5?c=u/a:c=u/(2-a),[Math.round(l)%360,c,f,i==null?1:i]},o.hsla.from=function(e){if(e[0]==null||e[1]==null||e[2]==null)return[null,null,null,e[3]];var t=e[0]/360,n=e[1],r=e[2],i=e[3],s=r<=.5?r*(1+n):r+n-r*n,o=2*r-s;return[Math.round(d(o,s,t+1/3)*255),Math.round(d(o,s,t)*255),Math.round(d(o,s,t-1/3)*255),i]},c(o,function(n,i){var o=i.props,u=i.cache,a=i.to,f=i.from;s.fn[n]=function(n){a&&!this[u]&&(this[u]=a(this._rgba));if(n===t)return this[u].slice();var r,i=e.type(n),l=i==="array"||i==="object"?n:arguments,p=this[u].slice();return c(o,function(e,t){var n=l[i==="object"?e:t.idx];n==null&&(n=p[t.idx]),p[t.idx]=h(n,t)}),f?(r=s(f(p)),r[u]=p,r):s(p)},c(o,function(t,i){if(s.fn[t])return;s.fn[t]=function(s){var o=e.type(s),u=t==="alpha"?this._hsla?"hsla":"rgba":n,a=this[u](),f=a[i.idx],l;return o==="undefined"?f:(o==="function"&&(s=s.call(this,f),o=e.type(s)),s==null&&i.empty?this:(o==="string"&&(l=r.exec(s),l&&(s=f+parseFloat(l[2])*(l[1]==="+"?1:-1))),a[i.idx]=s,this[u](a)))}})}),s.hook=function(t){var n=t.split(" ");c(n,function(t,n){e.cssHooks[n]={set:function(t,r){var i,o,u="";if(r!=="transparent"&&(e.type(r)!=="string"||(i=p(r)))){r=s(i||r);if(!a.rgba&&r._rgba[3]!==1){o=n==="backgroundColor"?t.parentNode:t;while((u===""||u==="transparent")&&o&&o.style)try{u=e.css(o,"backgroundColor"),o=o.parentNode}catch(f){}r=r.blend(u&&u!=="transparent"?u:"_default")}r=r.toRgbaString()}try{t.style[n]=r}catch(f){}}},e.fx.step[n]=function(t){t.colorInit||(t.start=s(t.elem,n),t.end=s(t.end),t.colorInit=!0),e.cssHooks[n].set(t.elem,t.start.transition(t.end,t.pos))}})},s.hook(n),e.cssHooks.borderColor={expand:function(e){var t={};return c(["Top","Right","Bottom","Left"],function(n,r){t["border"+r+"Color"]=e}),t}},l=e.Color.names={aqua:"#00ffff",black:"#000000",blue:"#0000ff",fuchsia:"#ff00ff",gray:"#808080",green:"#008000",lime:"#00ff00",maroon:"#800000",navy:"#000080",olive:"#808000",purple:"#800080",red:"#ff0000",silver:"#c0c0c0",teal:"#008080",white:"#ffffff",yellow:"#ffff00",transparent:[null,null,null,0],_default:"#ffffff"}}(jQuery),function(){function i(t){var n,r,i=t.ownerDocument.defaultView?t.ownerDocument.defaultView.getComputedStyle(t,null):t.currentStyle,s={};if(i&&i.length&&i[0]&&i[i[0]]){r=i.length;while(r--)n=i[r],typeof i[n]=="string"&&(s[e.camelCase(n)]=i[n])}else for(n in i)typeof i[n]=="string"&&(s[n]=i[n]);return s}function s(t,n){var i={},s,o;for(s in n)o=n[s],t[s]!==o&&!r[s]&&(e.fx.step[s]||!isNaN(parseFloat(o)))&&(i[s]=o);return i}var n=["add","remove","toggle"],r={border:1,borderBottom:1,borderColor:1,borderLeft:1,borderRight:1,borderTop:1,borderWidth:1,margin:1,padding:1};e.each(["borderLeftStyle","borderRightStyle","borderBottomStyle","borderTopStyle"],function(t,n){e.fx.step[n]=function(e){if(e.end!=="none"&&!e.setAttr||e.pos===1&&!e.setAttr)jQuery.style(e.elem,n,e.end),e.setAttr=!0}}),e.fn.addBack||(e.fn.addBack=function(e){return this.add(e==null?this.prevObject:this.prevObject.filter(e))}),e.effects.animateClass=function(t,r,o,u){var a=e.speed(r,o,u);return this.queue(function(){var r=e(this),o=r.attr("class")||"",u,f=a.children?r.find("*").addBack():r;f=f.map(function(){var t=e(this);return{el:t,start:i(this)}}),u=function(){e.each(n,function(e,n){t[n]&&r[n+"Class"](t[n])})},u(),f=f.map(function(){return this.end=i(this.el[0]),this.diff=s(this.start,this.end),this}),r.attr("class",o),f=f.map(function(){var t=this,n=e.Deferred(),r=e.extend({},a,{queue:!1,complete:function(){n.resolve(t)}});return this.el.animate(this.diff,r),n.promise()}),e.when.apply(e,f.get()).done(function(){u(),e.each(arguments,function(){var t=this.el;e.each(this.diff,function(e){t.css(e,"")})}),a.complete.call(r[0])})})},e.fn.extend({_addClass:e.fn.addClass,addClass:function(t,n,r,i){return n?e.effects.animateClass.call(this,{add:t},n,r,i):this._addClass(t)},_removeClass:e.fn.removeClass,removeClass:function(t,n,r,i){return n?e.effects.animateClass.call(this,{remove:t},n,r,i):this._removeClass(t)},_toggleClass:e.fn.toggleClass,toggleClass:function(n,r,i,s,o){return typeof r=="boolean"||r===t?i?e.effects.animateClass.call(this,r?{add:n}:{remove:n},i,s,o):this._toggleClass(n,r):e.effects.animateClass.call(this,{toggle:n},r,i,s)},switchClass:function(t,n,r,i,s){return e.effects.animateClass.call(this,{add:n,remove:t},r,i,s)}})}(),function(){function r(t,n,r,i){e.isPlainObject(t)&&(n=t,t=t.effect),t={effect:t},n==null&&(n={}),e.isFunction(n)&&(i=n,r=null,n={});if(typeof n=="number"||e.fx.speeds[n])i=r,r=n,n={};return e.isFunction(r)&&(i=r,r=null),n&&e.extend(t,n),r=r||n.duration,t.duration=e.fx.off?0:typeof r=="number"?r:r in e.fx.speeds?e.fx.speeds[r]:e.fx.speeds._default,t.complete=i||n.complete,t}function i(t){return!t||typeof t=="number"||e.fx.speeds[t]?!0:typeof t=="string"&&!e.effects.effect[t]}e.extend(e.effects,{version:"1.10.0",save:function(e,t){for(var r=0;r<t.length;r++)t[r]!==null&&e.data(n+t[r],e[0].style[t[r]])},restore:function(e,r){var i,s;for(s=0;s<r.length;s++)r[s]!==null&&(i=e.data(n+r[s]),i===t&&(i=""),e.css(r[s],i))},setMode:function(e,t){return t==="toggle"&&(t=e.is(":hidden")?"show":"hide"),t},getBaseline:function(e,t){var n,r;switch(e[0]){case"top":n=0;break;case"middle":n=.5;break;case"bottom":n=1;break;default:n=e[0]/t.height}switch(e[1]){case"left":r=0;break;case"center":r=.5;break;case"right":r=1;break;default:r=e[1]/t.width}return{x:r,y:n}},createWrapper:function(t){if(t.parent().is(".ui-effects-wrapper"))return t.parent();var n={width:t.outerWidth(!0),height:t.outerHeight(!0),"float":t.css("float")},r=e("<div></div>").addClass("ui-effects-wrapper").css({fontSize:"100%",background:"transparent",border:"none",margin:0,padding:0}),i={width:t.width(),height:t.height()},s=document.activeElement;try{s.id}catch(o){s=document.body}return t.wrap(r),(t[0]===s||e.contains(t[0],s))&&e(s).focus(),r=t.parent(),t.css("position")==="static"?(r.css({position:"relative"}),t.css({position:"relative"})):(e.extend(n,{position:t.css("position"),zIndex:t.css("z-index")}),e.each(["top","left","bottom","right"],function(e,r){n[r]=t.css(r),isNaN(parseInt(n[r],10))&&(n[r]="auto")}),t.css({position:"relative",top:0,left:0,right:"auto",bottom:"auto"})),t.css(i),r.css(n).show()},removeWrapper:function(t){var n=document.activeElement;return t.parent().is(".ui-effects-wrapper")&&(t.parent().replaceWith(t),(t[0]===n||e.contains(t[0],n))&&e(n).focus()),t},setTransition:function(t,n,r,i){return i=i||{},e.each(n,function(e,n){var s=t.cssUnit(n);s[0]>0&&(i[n]=s[0]*r+s[1])}),i}}),e.fn.extend({effect:function(){function o(n){function u(){e.isFunction(i)&&i.call(r[0]),e.isFunction(n)&&n()}var r=e(this),i=t.complete,o=t.mode;(r.is(":hidden")?o==="hide":o==="show")?u():s.call(r[0],t,u)}var t=r.apply(this,arguments),n=t.mode,i=t.queue,s=e.effects.effect[t.effect];return e.fx.off||!s?n?this[n](t.duration,t.complete):this.each(function(){t.complete&&t.complete.call(this)}):i===!1?this.each(o):this.queue(i||"fx",o)},_show:e.fn.show,show:function(e){if(i(e))return this._show.apply(this,arguments);var t=r.apply(this,arguments);return t.mode="show",this.effect.call(this,t)},_hide:e.fn.hide,hide:function(e){if(i(e))return this._hide.apply(this,arguments);var t=r.apply(this,arguments);return t.mode="hide",this.effect.call(this,t)},__toggle:e.fn.toggle,toggle:function(t){if(i(t)||typeof t=="boolean"||e.isFunction(t))return this.__toggle.apply(this,arguments);var n=r.apply(this,arguments);return n.mode="toggle",this.effect.call(this,n)},cssUnit:function(t){var n=this.css(t),r=[];return e.each(["em","px","%","pt"],function(e,t){n.indexOf(t)>0&&(r=[parseFloat(n),t])}),r}})}(),function(){var t={};e.each(["Quad","Cubic","Quart","Quint","Expo"],function(e,n){t[n]=function(t){return Math.pow(t,e+2)}}),e.extend(t,{Sine:function(e){return 1-Math.cos(e*Math.PI/2)},Circ:function(e){return 1-Math.sqrt(1-e*e)},Elastic:function(e){return e===0||e===1?e:-Math.pow(2,8*(e-1))*Math.sin(((e-1)*80-7.5)*Math.PI/15)},Back:function(e){return e*e*(3*e-2)},Bounce:function(e){var t,n=4;while(e<((t=Math.pow(2,--n))-1)/11);return 1/Math.pow(4,3-n)-7.5625*Math.pow((t*3-2)/22-e,2)}}),e.each(t,function(t,n){e.easing["easeIn"+t]=n,e.easing["easeOut"+t]=function(e){return 1-n(1-e)},e.easing["easeInOut"+t]=function(e){return e<.5?n(e*2)/2:1-n(e*-2+2)/2}})}()}(jQuery);(function(e,t){var n=/up|down|vertical/,r=/up|left|vertical|horizontal/;e.effects.effect.blind=function(t,i){var s=e(this),o=["position","top","bottom","left","right","height","width"],u=e.effects.setMode(s,t.mode||"hide"),a=t.direction||"up",f=n.test(a),l=f?"height":"width",c=f?"top":"left",h=r.test(a),p={},d=u==="show",v,m,g;s.parent().is(".ui-effects-wrapper")?e.effects.save(s.parent(),o):e.effects.save(s,o),s.show(),v=e.effects.createWrapper(s).css({overflow:"hidden"}),m=v[l](),g=parseFloat(v.css(c))||0,p[l]=d?m:0,h||(s.css(f?"bottom":"right",0).css(f?"top":"left","auto").css({position:"absolute"}),p[c]=d?g:m+g),d&&(v.css(l,0),h||v.css(c,g+m)),v.animate(p,{duration:t.duration,easing:t.easing,queue:!1,complete:function(){u==="hide"&&s.hide(),e.effects.restore(s,o),e.effects.removeWrapper(s),i()}})}})(jQuery);(function(e,t){e.effects.effect.bounce=function(t,n){var r=e(this),i=["position","top","bottom","left","right","height","width"],s=e.effects.setMode(r,t.mode||"effect"),o=s==="hide",u=s==="show",a=t.direction||"up",f=t.distance,l=t.times||5,c=l*2+(u||o?1:0),h=t.duration/c,p=t.easing,d=a==="up"||a==="down"?"top":"left",v=a==="up"||a==="left",m,g,y,b=r.queue(),w=b.length;(u||o)&&i.push("opacity"),e.effects.save(r,i),r.show(),e.effects.createWrapper(r),f||(f=r[d==="top"?"outerHeight":"outerWidth"]()/3),u&&(y={opacity:1},y[d]=0,r.css("opacity",0).css(d,v?-f*2:f*2).animate(y,h,p)),o&&(f/=Math.pow(2,l-1)),y={},y[d]=0;for(m=0;m<l;m++)g={},g[d]=(v?"-=":"+=")+f,r.animate(g,h,p).animate(y,h,p),f=o?f*2:f/2;o&&(g={opacity:0},g[d]=(v?"-=":"+=")+f,r.animate(g,h,p)),r.queue(function(){o&&r.hide(),e.effects.restore(r,i),e.effects.removeWrapper(r),n()}),w>1&&b.splice.apply(b,[1,0].concat(b.splice(w,c+1))),r.dequeue()}})(jQuery);(function(e,t){e.effects.effect.clip=function(t,n){var r=e(this),i=["position","top","bottom","left","right","height","width"],s=e.effects.setMode(r,t.mode||"hide"),o=s==="show",u=t.direction||"vertical",a=u==="vertical",f=a?"height":"width",l=a?"top":"left",c={},h,p,d;e.effects.save(r,i),r.show(),h=e.effects.createWrapper(r).css({overflow:"hidden"}),p=r[0].tagName==="IMG"?h:r,d=p[f](),o&&(p.css(f,0),p.css(l,d/2)),c[f]=o?d:0,c[l]=o?0:d/2,p.animate(c,{queue:!1,duration:t.duration,easing:t.easing,complete:function(){o||r.hide(),e.effects.restore(r,i),e.effects.removeWrapper(r),n()}})}})(jQuery);(function(e,t){e.effects.effect.drop=function(t,n){var r=e(this),i=["position","top","bottom","left","right","opacity","height","width"],s=e.effects.setMode(r,t.mode||"hide"),o=s==="show",u=t.direction||"left",a=u==="up"||u==="down"?"top":"left",f=u==="up"||u==="left"?"pos":"neg",l={opacity:o?1:0},c;e.effects.save(r,i),r.show(),e.effects.createWrapper(r),c=t.distance||r[a==="top"?"outerHeight":"outerWidth"](!0)/2,o&&r.css("opacity",0).css(a,f==="pos"?-c:c),l[a]=(o?f==="pos"?"+=":"-=":f==="pos"?"-=":"+=")+c,r.animate(l,{queue:!1,duration:t.duration,easing:t.easing,complete:function(){s==="hide"&&r.hide(),e.effects.restore(r,i),e.effects.removeWrapper(r),n()}})}})(jQuery);(function(e,t){e.effects.effect.explode=function(t,n){function y(){c.push(this),c.length===r*i&&b()}function b(){s.css({visibility:"visible"}),e(c).remove(),u||s.hide(),n()}var r=t.pieces?Math.round(Math.sqrt(t.pieces)):3,i=r,s=e(this),o=e.effects.setMode(s,t.mode||"hide"),u=o==="show",a=s.show().css("visibility","hidden").offset(),f=Math.ceil(s.outerWidth()/i),l=Math.ceil(s.outerHeight()/r),c=[],h,p,d,v,m,g;for(h=0;h<r;h++){v=a.top+h*l,g=h-(r-1)/2;for(p=0;p<i;p++)d=a.left+p*f,m=p-(i-1)/2,s.clone().appendTo("body").wrap("<div></div>").css({position:"absolute",visibility:"visible",left:-p*f,top:-h*l}).parent().addClass("ui-effects-explode").css({position:"absolute",overflow:"hidden",width:f,height:l,left:d+(u?m*f:0),top:v+(u?g*l:0),opacity:u?0:1}).animate({left:d+(u?0:m*f),top:v+(u?0:g*l),opacity:u?1:0},t.duration||500,t.easing,y)}}})(jQuery);(function(e,t){e.effects.effect.fade=function(t,n){var r=e(this),i=e.effects.setMode(r,t.mode||"toggle");r.animate({opacity:i},{queue:!1,duration:t.duration,easing:t.easing,complete:n})}})(jQuery);(function(e,t){e.effects.effect.fold=function(t,n){var r=e(this),i=["position","top","bottom","left","right","height","width"],s=e.effects.setMode(r,t.mode||"hide"),o=s==="show",u=s==="hide",a=t.size||15,f=/([0-9]+)%/.exec(a),l=!!t.horizFirst,c=o!==l,h=c?["width","height"]:["height","width"],p=t.duration/2,d,v,m={},g={};e.effects.save(r,i),r.show(),d=e.effects.createWrapper(r).css({overflow:"hidden"}),v=c?[d.width(),d.height()]:[d.height(),d.width()],f&&(a=parseInt(f[1],10)/100*v[u?0:1]),o&&d.css(l?{height:0,width:a}:{height:a,width:0}),m[h[0]]=o?v[0]:a,g[h[1]]=o?v[1]:0,d.animate(m,p,t.easing).animate(g,p,t.easing,function(){u&&r.hide(),e.effects.restore(r,i),e.effects.removeWrapper(r),n()})}})(jQuery);(function(e,t){e.effects.effect.highlight=function(t,n){var r=e(this),i=["backgroundImage","backgroundColor","opacity"],s=e.effects.setMode(r,t.mode||"show"),o={backgroundColor:r.css("backgroundColor")};s==="hide"&&(o.opacity=0),e.effects.save(r,i),r.show().css({backgroundImage:"none",backgroundColor:t.color||"#ffff99"}).animate(o,{queue:!1,duration:t.duration,easing:t.easing,complete:function(){s==="hide"&&r.hide(),e.effects.restore(r,i),n()}})}})(jQuery);(function(e,t){e.effects.effect.pulsate=function(t,n){var r=e(this),i=e.effects.setMode(r,t.mode||"show"),s=i==="show",o=i==="hide",u=s||i==="hide",a=(t.times||5)*2+(u?1:0),f=t.duration/a,l=0,c=r.queue(),h=c.length,p;if(s||!r.is(":visible"))r.css("opacity",0).show(),l=1;for(p=1;p<a;p++)r.animate({opacity:l},f,t.easing),l=1-l;r.animate({opacity:l},f,t.easing),r.queue(function(){o&&r.hide(),n()}),h>1&&c.splice.apply(c,[1,0].concat(c.splice(h,a+1))),r.dequeue()}})(jQuery);(function(e,t){e.effects.effect.puff=function(t,n){var r=e(this),i=e.effects.setMode(r,t.mode||"hide"),s=i==="hide",o=parseInt(t.percent,10)||150,u=o/100,a={height:r.height(),width:r.width(),outerHeight:r.outerHeight(),outerWidth:r.outerWidth()};e.extend(t,{effect:"scale",queue:!1,fade:!0,mode:i,complete:n,percent:s?o:100,from:s?a:{height:a.height*u,width:a.width*u,outerHeight:a.outerHeight*u,outerWidth:a.outerWidth*u}}),r.effect(t)},e.effects.effect.scale=function(t,n){var r=e(this),i=e.extend(!0,{},t),s=e.effects.setMode(r,t.mode||"effect"),o=parseInt(t.percent,10)||(parseInt(t.percent,10)===0?0:s==="hide"?0:100),u=t.direction||"both",a=t.origin,f={height:r.height(),width:r.width(),outerHeight:r.outerHeight(),outerWidth:r.outerWidth()},l={y:u!=="horizontal"?o/100:1,x:u!=="vertical"?o/100:1};i.effect="size",i.queue=!1,i.complete=n,s!=="effect"&&(i.origin=a||["middle","center"],i.restore=!0),i.from=t.from||(s==="show"?{height:0,width:0,outerHeight:0,outerWidth:0}:f),i.to={height:f.height*l.y,width:f.width*l.x,outerHeight:f.outerHeight*l.y,outerWidth:f.outerWidth*l.x},i.fade&&(s==="show"&&(i.from.opacity=0,i.to.opacity=1),s==="hide"&&(i.from.opacity=1,i.to.opacity=0)),r.effect(i)},e.effects.effect.size=function(t,n){var r,i,s,o=e(this),u=["position","top","bottom","left","right","width","height","overflow","opacity"],a=["position","top","bottom","left","right","overflow","opacity"],f=["width","height","overflow"],l=["fontSize"],c=["borderTopWidth","borderBottomWidth","paddingTop","paddingBottom"],h=["borderLeftWidth","borderRightWidth","paddingLeft","paddingRight"],p=e.effects.setMode(o,t.mode||"effect"),d=t.restore||p!=="effect",v=t.scale||"both",m=t.origin||["middle","center"],g=o.css("position"),y=d?u:a,b={height:0,width:0,outerHeight:0,outerWidth:0};p==="show"&&o.show(),r={height:o.height(),width:o.width(),outerHeight:o.outerHeight(),outerWidth:o.outerWidth()},t.mode==="toggle"&&p==="show"?(o.from=t.to||b,o.to=t.from||r):(o.from=t.from||(p==="show"?b:r),o.to=t.to||(p==="hide"?b:r)),s={from:{y:o.from.height/r.height,x:o.from.width/r.width},to:{y:o.to.height/r.height,x:o.to.width/r.width}};if(v==="box"||v==="both")s.from.y!==s.to.y&&(y=y.concat(c),o.from=e.effects.setTransition(o,c,s.from.y,o.from),o.to=e.effects.setTransition(o,c,s.to.y,o.to)),s.from.x!==s.to.x&&(y=y.concat(h),o.from=e.effects.setTransition(o,h,s.from.x,o.from),o.to=e.effects.setTransition(o,h,s.to.x,o.to));(v==="content"||v==="both")&&s.from.y!==s.to.y&&(y=y.concat(l).concat(f),o.from=e.effects.setTransition(o,l,s.from.y,o.from),o.to=e.effects.setTransition(o,l,s.to.y,o.to)),e.effects.save(o,y),o.show(),e.effects.createWrapper(o),o.css("overflow","hidden").css(o.from),m&&(i=e.effects.getBaseline(m,r),o.from.top=(r.outerHeight-o.outerHeight())*i.y,o.from.left=(r.outerWidth-o.outerWidth())*i.x,o.to.top=(r.outerHeight-o.to.outerHeight)*i.y,o.to.left=(r.outerWidth-o.to.outerWidth)*i.x),o.css(o.from);if(v==="content"||v==="both")c=c.concat(["marginTop","marginBottom"]).concat(l),h=h.concat(["marginLeft","marginRight"]),f=u.concat(c).concat(h),o.find("*[width]").each(function(){var n=e(this),r={height:n.height(),width:n.width(),outerHeight:n.outerHeight(),outerWidth:n.outerWidth()};d&&e.effects.save(n,f),n.from={height:r.height*s.from.y,width:r.width*s.from.x,outerHeight:r.outerHeight*s.from.y,outerWidth:r.outerWidth*s.from.x},n.to={height:r.height*s.to.y,width:r.width*s.to.x,outerHeight:r.height*s.to.y,outerWidth:r.width*s.to.x},s.from.y!==s.to.y&&(n.from=e.effects.setTransition(n,c,s.from.y,n.from),n.to=e.effects.setTransition(n,c,s.to.y,n.to)),s.from.x!==s.to.x&&(n.from=e.effects.setTransition(n,h,s.from.x,n.from),n.to=e.effects.setTransition(n,h,s.to.x,n.to)),n.css(n.from),n.animate(n.to,t.duration,t.easing,function(){d&&e.effects.restore(n,f)})});o.animate(o.to,{queue:!1,duration:t.duration,easing:t.easing,complete:function(){o.to.opacity===0&&o.css("opacity",o.from.opacity),p==="hide"&&o.hide(),e.effects.restore(o,y),d||(g==="static"?o.css({position:"relative",top:o.to.top,left:o.to.left}):e.each(["top","left"],function(e,t){o.css(t,function(t,n){var r=parseInt(n,10),i=e?o.to.left:o.to.top;return n==="auto"?i+"px":r+i+"px"})})),e.effects.removeWrapper(o),n()}})}})(jQuery);(function(e,t){e.effects.effect.shake=function(t,n){var r=e(this),i=["position","top","bottom","left","right","height","width"],s=e.effects.setMode(r,t.mode||"effect"),o=t.direction||"left",u=t.distance||20,a=t.times||3,f=a*2+1,l=Math.round(t.duration/f),c=o==="up"||o==="down"?"top":"left",h=o==="up"||o==="left",p={},d={},v={},m,g=r.queue(),y=g.length;e.effects.save(r,i),r.show(),e.effects.createWrapper(r),p[c]=(h?"-=":"+=")+u,d[c]=(h?"+=":"-=")+u*2,v[c]=(h?"-=":"+=")+u*2,r.animate(p,l,t.easing);for(m=1;m<a;m++)r.animate(d,l,t.easing).animate(v,l,t.easing);r.animate(d,l,t.easing).animate(p,l/2,t.easing).queue(function(){s==="hide"&&r.hide(),e.effects.restore(r,i),e.effects.removeWrapper(r),n()}),y>1&&g.splice.apply(g,[1,0].concat(g.splice(y,f+1))),r.dequeue()}})(jQuery);(function(e,t){e.effects.effect.slide=function(t,n){var r=e(this),i=["position","top","bottom","left","right","width","height"],s=e.effects.setMode(r,t.mode||"show"),o=s==="show",u=t.direction||"left",a=u==="up"||u==="down"?"top":"left",f=u==="up"||u==="left",l,c={};e.effects.save(r,i),r.show(),l=t.distance||r[a==="top"?"outerHeight":"outerWidth"](!0),e.effects.createWrapper(r).css({overflow:"hidden"}),o&&r.css(a,f?isNaN(l)?"-"+l:-l:l),c[a]=(o?f?"+=":"-=":f?"-=":"+=")+l,r.animate(c,{queue:!1,duration:t.duration,easing:t.easing,complete:function(){s==="hide"&&r.hide(),e.effects.restore(r,i),e.effects.removeWrapper(r),n()}})}})(jQuery);(function(e,t){e.effects.effect.transfer=function(t,n){var r=e(this),i=e(t.to),s=i.css("position")==="fixed",o=e("body"),u=s?o.scrollTop():0,a=s?o.scrollLeft():0,f=i.offset(),l={top:f.top-u,left:f.left-a,height:i.innerHeight(),width:i.innerWidth()},c=r.offset(),h=e("<div class='ui-effects-transfer'></div>").appendTo(document.body).addClass(t.className).css({top:c.top-u,left:c.left-a,height:r.innerHeight(),width:r.innerWidth(),position:s?"fixed":"absolute"}).animate(l,t.duration,t.easing,function(){h.remove(),n()})}})(jQuery);
/**
 * Really Simple Color Picker in jQuery
 *
 * Licensed under the MIT (MIT-LICENSE.txt) licenses.
 *
 * Copyright (c) 2008-2012
 * Lakshan Perera (www.laktek.com) & Daniel Lacy (daniellacy.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */(function(a){var b,c,d=0,e={control:a('<div class="colorPicker-picker">&nbsp;</div>'),palette:a('<div id="colorPicker_palette" class="colorPicker-palette" />'),swatch:a('<div class="colorPicker-swatch">&nbsp;</div>'),hexLabel:a('<label for="colorPicker_hex">Hex</label>'),hexField:a('<input type="text" id="colorPicker_hex" />')},f="transparent",g;a.fn.colorPicker=function(b){return this.each(function(){var c=a(this),g=a.extend({},a.fn.colorPicker.defaults,b),h=a.fn.colorPicker.toHex(c.val().length>0?c.val():g.pickerDefault),i=e.control.clone(),j=e.palette.clone().attr("id","colorPicker_palette-"+d),k=e.hexLabel.clone(),l=e.hexField.clone(),m=j[0].id,n;a.each(g.colors,function(b){n=e.swatch.clone(),g.colors[b]===f?(n.addClass(f).text("X"),a.fn.colorPicker.bindPalette(l,n,f)):(n.css("background-color","#"+this),a.fn.colorPicker.bindPalette(l,n)),n.appendTo(j)}),k.attr("for","colorPicker_hex-"+d),l.attr({id:"colorPicker_hex-"+d,value:h}),l.bind("keydown",function(b){if(b.keyCode===13){var d=a.fn.colorPicker.toHex(a(this).val());a.fn.colorPicker.changeColor(d?d:c.val())}b.keyCode===27&&a.fn.colorPicker.hidePalette()}),l.bind("keyup",function(b){var d=a.fn.colorPicker.toHex(a(b.target).val());a.fn.colorPicker.previewColor(d?d:c.val())}),a('<div class="colorPicker_hexWrap" />').append(k).appendTo(j),j.find(".colorPicker_hexWrap").append(l),a("body").append(j),j.hide(),i.css("background-color",h),i.bind("click",function(){c.is(":not(:disabled)")&&a.fn.colorPicker.togglePalette(a("#"+m),a(this))}),b&&b.onColorChange?i.data("onColorChange",b.onColorChange):i.data("onColorChange",function(){}),c.after(i),c.bind("change",function(){c.next(".colorPicker-picker").css("background-color",a.fn.colorPicker.toHex(a(this).val()))}),c.val(h).hide(),d++})},a.extend(!0,a.fn.colorPicker,{toHex:function(a){if(a.match(/[0-9A-F]{6}|[0-9A-F]{3}$/i))return a.charAt(0)==="#"?a:"#"+a;if(!a.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/))return!1;var b=[parseInt(RegExp.$1,10),parseInt(RegExp.$2,10),parseInt(RegExp.$3,10)],c=function(a){if(a.length<2)for(var b=0,c=2-a.length;b<c;b++)a="0"+a;return a};if(b.length===3){var d=c(b[0].toString(16)),e=c(b[1].toString(16)),f=c(b[2].toString(16));return"#"+d+e+f}},checkMouse:function(d,e){var f=c,g=a(d.target).parents("#"+f.attr("id")).length;if(d.target===a(f)[0]||d.target===b[0]||g>0)return;a.fn.colorPicker.hidePalette()},hidePalette:function(){a(document).unbind("mousedown",a.fn.colorPicker.checkMouse),a(".colorPicker-palette").hide()},showPalette:function(c){var d=b.prev("input").val();c.css({top:b.offset().top+b.outerHeight(),left:b.offset().left}),a("#color_value").val(d),c.show(),a(document).bind("mousedown",a.fn.colorPicker.checkMouse)},togglePalette:function(d,e){e&&(b=e),c=d,c.is(":visible")?a.fn.colorPicker.hidePalette():a.fn.colorPicker.showPalette(d)},changeColor:function(c){b.css("background-color",c),b.prev("input").val(c).change(),a.fn.colorPicker.hidePalette(),b.data("onColorChange").call(b,a(b).prev("input").attr("id"),c)},previewColor:function(a){b.css("background-color",a)},bindPalette:function(c,d,e){e=e?e:a.fn.colorPicker.toHex(d.css("background-color")),d.bind({click:function(b){g=e,a.fn.colorPicker.changeColor(e)},mouseover:function(b){g=c.val(),a(this).css("border-color","#598FEF"),c.val(e),a.fn.colorPicker.previewColor(e)},mouseout:function(d){a(this).css("border-color","#000"),c.val(b.css("background-color")),c.val(g),a.fn.colorPicker.previewColor(g)}})}}),a.fn.colorPicker.defaults={pickerDefault:"FFFFFF",colors:["000000","993300","333300","000080","333399","333333","800000","FF6600","808000","008000","008080","0000FF","666699","808080","FF0000","FF9900","99CC00","339966","33CCCC","3366FF","800080","999999","FF00FF","FFCC00","FFFF00","00FF00","00FFFF","00CCFF","993366","C0C0C0","FF99CC","FFCC99","FFFF99","CCFFFF","99CCFF","FFFFFF"],addColors:[]}})(jQuery);
/*! jQuery plugin for Hammer.JS - v1.1.3 - 2014-05-20
 * http://eightmedia.github.com/hammer.js
 *
 * Copyright (c) 2014 Jorik Tangelder <j.tangelder@gmail.com>;
 * Licensed under the MIT license */

!function(a,b){"use strict";function c(a,c){Date.now||(Date.now=function(){return(new Date).getTime()}),a.utils.each(["on","off"],function(d){a.utils[d]=function(a,e,f){c(a)[d](e,function(a){var d=c.extend({},a.originalEvent,a);d.button===b&&(d.button=a.which-1),f.call(this,d)})}}),a.Instance.prototype.trigger=function(a,b){var d=c(this.element);return d.has(b.target).length&&(d=c(b.target)),d.trigger({type:a,gesture:b})},c.fn.hammer=function(b){return this.each(function(){var d=c(this),e=d.data("hammer");e?e&&b&&a.utils.extend(e.options,b):d.data("hammer",new a(this,b||{}))})}}"function"==typeof define&&define.amd?define(["hammerjs","jquery"],c):c(a.Hammer,a.jQuery||a.Zepto)}(window);

/*! Hammer.JS - v1.0.4dev - 2013-03-07
 * http://eightmedia.github.com/hammer.js
 *
 * Copyright (c) 2013 Jorik Tangelder <j.tangelder@gmail.com>;
 * Licensed under the MIT license */

(function(t,e){"use strict";function n(){if(!r.READY){r.event.determineEventTypes();for(var t in r.gestures)r.gestures.hasOwnProperty(t)&&r.detection.register(r.gestures[t]);r.event.onTouch(r.DOCUMENT,r.EVENT_MOVE,r.detection.detect),r.event.onTouch(r.DOCUMENT,r.EVENT_END,r.detection.detect),r.READY=!0}}var r=function(t,e){return new r.Instance(t,e||{})};r.defaults={stop_browser_behavior:{userSelect:"none",touchCallout:"none",touchAction:"none",contentZooming:"none",userDrag:"none",tapHighlightColor:"rgba(0,0,0,0)"}},r.HAS_POINTEREVENTS=navigator.pointerEnabled||navigator.msPointerEnabled,r.HAS_TOUCHEVENTS="ontouchstart"in t,r.EVENT_TYPES={},r.DIRECTION_DOWN="down",r.DIRECTION_LEFT="left",r.DIRECTION_UP="up",r.DIRECTION_RIGHT="right",r.POINTER_MOUSE="mouse",r.POINTER_TOUCH="touch",r.POINTER_PEN="pen",r.EVENT_START="start",r.EVENT_MOVE="move",r.EVENT_END="end",r.DOCUMENT=document,r.plugins={},r.READY=!1,r.Instance=function(t,e){var i=this;return n(),this.element=t,this.enabled=!0,this.options=r.utils.extend(r.utils.extend({},r.defaults),e||{}),this.options.stop_browser_behavior&&r.utils.stopDefaultBrowserBehavior(this.element,this.options.stop_browser_behavior),r.event.onTouch(t,r.EVENT_START,function(t){i.enabled&&r.detection.startDetect(i,t)}),this},r.Instance.prototype={on:function(t,e){for(var n=t.split(" "),r=0;n.length>r;r++)this.element.addEventListener(n[r],e,!1);return this},off:function(t,e){for(var n=t.split(" "),r=0;n.length>r;r++)this.element.removeEventListener(n[r],e,!1);return this},trigger:function(t,e){var n=r.DOCUMENT.createEvent("Event");n.initEvent(t,!0,!0),n.gesture=e;var i=this.element;return r.utils.hasParent(e.target,i)&&(i=e.target),i.dispatchEvent(n),this},enable:function(t){return this.enabled=t,this}};var i=null,o=!1,s=!1;r.event={bindDom:function(t,e,n){for(var r=e.split(" "),i=0;r.length>i;i++)t.addEventListener(r[i],n,!1)},onTouch:function(t,e,n){var a=this;this.bindDom(t,r.EVENT_TYPES[e],function(c){var u=c.type.toLowerCase();if(!u.match(/mouse/)||!s){(u.match(/touch/)||u.match(/pointerdown/)||u.match(/mouse/)&&1===c.which)&&(o=!0),u.match(/touch|pointer/)&&(s=!0);var h=0;o&&(r.HAS_POINTEREVENTS&&e!=r.EVENT_END?h=r.PointerEvent.updatePointer(e,c):u.match(/touch/)?h=c.touches.length:s||(h=u.match(/up/)?0:1),h>0&&e==r.EVENT_END?e=r.EVENT_MOVE:h||(e=r.EVENT_END),h||null===i?i=c:c=i,n.call(r.detection,a.collectEventData(t,e,c)),r.HAS_POINTEREVENTS&&e==r.EVENT_END&&(h=r.PointerEvent.updatePointer(e,c))),h||(i=null,o=!1,s=!1,r.PointerEvent.reset())}})},determineEventTypes:function(){var t;t=r.HAS_POINTEREVENTS?r.PointerEvent.getEvents():["touchstart mousedown","touchmove mousemove","touchend touchcancel mouseup"],r.EVENT_TYPES[r.EVENT_START]=t[0],r.EVENT_TYPES[r.EVENT_MOVE]=t[1],r.EVENT_TYPES[r.EVENT_END]=t[2]},getTouchList:function(t){return r.HAS_POINTEREVENTS?r.PointerEvent.getTouchList():t.touches?t.touches:[{identifier:1,pageX:t.pageX,pageY:t.pageY,target:t.target}]},collectEventData:function(t,e,n){var i=this.getTouchList(n,e),o=r.POINTER_TOUCH;return(n.type.match(/mouse/)||r.PointerEvent.matchType(r.POINTER_MOUSE,n))&&(o=r.POINTER_MOUSE),{center:r.utils.getCenter(i),timeStamp:(new Date).getTime(),target:n.target,touches:i,eventType:e,pointerType:o,srcEvent:n,preventDefault:function(){this.srcEvent.preventManipulation&&this.srcEvent.preventManipulation(),this.srcEvent.preventDefault&&this.srcEvent.preventDefault()},stopPropagation:function(){this.srcEvent.stopPropagation()},stopDetect:function(){return r.detection.stopDetect()}}}},r.PointerEvent={pointers:{},getTouchList:function(){var t=this,e=[];return Object.keys(t.pointers).sort().forEach(function(n){e.push(t.pointers[n])}),e},updatePointer:function(t,e){return t==r.EVENT_END?delete this.pointers[e.pointerId]:(e.identifier=e.pointerId,this.pointers[e.pointerId]=e),Object.keys(this.pointers).length},matchType:function(t,e){if(!e.pointerType)return!1;var n={};return n[r.POINTER_MOUSE]=e.pointerType==e.MSPOINTER_TYPE_MOUSE||e.pointerType==r.POINTER_MOUSE,n[r.POINTER_TOUCH]=e.pointerType==e.MSPOINTER_TYPE_TOUCH||e.pointerType==r.POINTER_TOUCH,n[r.POINTER_PEN]=e.pointerType==e.MSPOINTER_TYPE_PEN||e.pointerType==r.POINTER_PEN,n[t]},getEvents:function(){return["pointerdown MSPointerDown","pointermove MSPointerMove","pointerup pointercancel MSPointerUp MSPointerCancel"]},reset:function(){this.pointers={}}},r.utils={extend:function(t,e){for(var n in e)t[n]=e[n];return t},hasParent:function(t,e){for(;t;){if(t==e)return!0;t=t.parentNode}return!1},getCenter:function(t){for(var e=[],n=[],r=0,i=t.length;i>r;r++)e.push(t[r].pageX),n.push(t[r].pageY);return{pageX:(Math.min.apply(Math,e)+Math.max.apply(Math,e))/2,pageY:(Math.min.apply(Math,n)+Math.max.apply(Math,n))/2}},getVelocity:function(t,e,n){return{x:Math.abs(e/t)||0,y:Math.abs(n/t)||0}},getAngle:function(t,e){var n=e.pageY-t.pageY,r=e.pageX-t.pageX;return 180*Math.atan2(n,r)/Math.PI},getDirection:function(t,e){var n=Math.abs(t.pageX-e.pageX),i=Math.abs(t.pageY-e.pageY);return n>=i?t.pageX-e.pageX>0?r.DIRECTION_LEFT:r.DIRECTION_RIGHT:t.pageY-e.pageY>0?r.DIRECTION_UP:r.DIRECTION_DOWN},getDistance:function(t,e){var n=e.pageX-t.pageX,r=e.pageY-t.pageY;return Math.sqrt(n*n+r*r)},getScale:function(t,e){return t.length>=2&&e.length>=2?this.getDistance(e[0],e[1])/this.getDistance(t[0],t[1]):1},getRotation:function(t,e){return t.length>=2&&e.length>=2?this.getAngle(e[1],e[0])-this.getAngle(t[1],t[0]):0},isVertical:function(t){return t==r.DIRECTION_UP||t==r.DIRECTION_DOWN},stopDefaultBrowserBehavior:function(t,e){var n,r=["webkit","khtml","moz","ms","o",""];if(e&&t.style){for(var i=0;r.length>i;i++)for(var o in e)e.hasOwnProperty(o)&&(n=o,r[i]&&(n=r[i]+n.substring(0,1).toUpperCase()+n.substring(1)),t.style[n]=e[o]);"none"==e.userSelect&&(t.onselectstart=function(){return!1})}}},r.detection={gestures:[],current:null,previous:null,stopped:!1,startDetect:function(t,e){this.current||(this.stopped=!1,this.current={inst:t,startEvent:r.utils.extend({},e),lastEvent:!1,name:""},this.detect(e))},detect:function(t){if(this.current&&!this.stopped){t=this.extendEventData(t);for(var e=this.current.inst.options,n=0,i=this.gestures.length;i>n;n++){var o=this.gestures[n];if(!this.stopped&&e[o.name]!==!1&&o.handler.call(o,t,this.current.inst)===!1){this.stopDetect();break}}return this.current&&(this.current.lastEvent=t),t.eventType==r.EVENT_END&&!t.touches.length-1&&this.stopDetect(),t}},stopDetect:function(){this.previous=r.utils.extend({},this.current),this.current=null,this.stopped=!0},extendEventData:function(t){var e=this.current.startEvent;if(e&&(t.touches.length!=e.touches.length||t.touches===e.touches)){e.touches=[];for(var n=0,i=t.touches.length;i>n;n++)e.touches.push(r.utils.extend({},t.touches[n]))}var o=t.timeStamp-e.timeStamp,s=t.center.pageX-e.center.pageX,a=t.center.pageY-e.center.pageY,c=r.utils.getVelocity(o,s,a);return r.utils.extend(t,{deltaTime:o,deltaX:s,deltaY:a,velocityX:c.x,velocityY:c.y,distance:r.utils.getDistance(e.center,t.center),angle:r.utils.getAngle(e.center,t.center),direction:r.utils.getDirection(e.center,t.center),scale:r.utils.getScale(e.touches,t.touches),rotation:r.utils.getRotation(e.touches,t.touches),startEvent:e}),t},register:function(t){var n=t.defaults||{};return n[t.name]===e&&(n[t.name]=!0),r.utils.extend(r.defaults,n),t.index=t.index||1e3,this.gestures.push(t),this.gestures.sort(function(t,e){return t.index<e.index?-1:t.index>e.index?1:0}),this.gestures}},r.gestures=r.gestures||{},r.gestures.Hold={name:"hold",index:10,defaults:{hold_timeout:500,hold_threshold:1},timer:null,handler:function(t,e){switch(t.eventType){case r.EVENT_START:clearTimeout(this.timer),r.detection.current.name=this.name,this.timer=setTimeout(function(){"hold"==r.detection.current.name&&e.trigger("hold",t)},e.options.hold_timeout);break;case r.EVENT_MOVE:t.distance>e.options.hold_threshold&&clearTimeout(this.timer);break;case r.EVENT_END:clearTimeout(this.timer)}}},r.gestures.Tap={name:"tap",index:100,defaults:{tap_max_touchtime:250,tap_max_distance:10,doubletap_distance:20,doubletap_interval:300},handler:function(t,e){if(t.eventType==r.EVENT_END){var n=r.detection.previous;if(t.deltaTime>e.options.tap_max_touchtime||t.distance>e.options.tap_max_distance)return;r.detection.current.name=n&&"tap"==n.name&&t.timeStamp-n.lastEvent.timeStamp<e.options.doubletap_interval&&t.distance<e.options.doubletap_distance?"doubletap":"tap",e.trigger(r.detection.current.name,t)}}},r.gestures.Swipe={name:"swipe",index:40,defaults:{swipe_max_touches:1,swipe_velocity:.7},handler:function(t,e){if(t.eventType==r.EVENT_END){if(e.options.swipe_max_touches>0&&t.touches.length>e.options.swipe_max_touches)return;(t.velocityX>e.options.swipe_velocity||t.velocityY>e.options.swipe_velocity)&&(e.trigger(this.name,t),e.trigger(this.name+t.direction,t))}}},r.gestures.Drag={name:"drag",index:50,defaults:{drag_min_distance:10,drag_max_touches:1,drag_block_horizontal:!1,drag_block_vertical:!1,drag_lock_to_axis:!1},triggered:!1,handler:function(t,n){if(r.detection.current.name!=this.name&&this.triggered)return n.trigger(this.name+"end",t),this.triggered=!1,e;if(!(n.options.drag_max_touches>0&&t.touches.length>n.options.drag_max_touches))switch(t.eventType){case r.EVENT_START:this.triggered=!1;break;case r.EVENT_MOVE:if(t.distance<n.options.drag_min_distance&&r.detection.current.name!=this.name)return;r.detection.current.name=this.name;var i=r.detection.current.lastEvent.direction;n.options.drag_lock_to_axis&&i!==t.direction&&(t.direction=r.utils.isVertical(i)?0>t.deltaY?r.DIRECTION_UP:r.DIRECTION_DOWN:0>t.deltaX?r.DIRECTION_LEFT:r.DIRECTION_RIGHT),this.triggered||(n.trigger(this.name+"start",t),this.triggered=!0),n.trigger(this.name,t),n.trigger(this.name+t.direction,t),(n.options.drag_block_vertical&&r.utils.isVertical(t.direction)||n.options.drag_block_horizontal&&!r.utils.isVertical(t.direction))&&t.preventDefault();break;case r.EVENT_END:this.triggered&&n.trigger(this.name+"end",t),this.triggered=!1}}},r.gestures.Transform={name:"transform",index:45,defaults:{transform_min_scale:.01,transform_min_rotation:1,transform_always_block:!1},triggered:!1,handler:function(t,n){if(r.detection.current.name!=this.name&&this.triggered)return n.trigger(this.name+"end",t),this.triggered=!1,e;if(!(2>t.touches.length))switch(n.options.transform_always_block&&t.preventDefault(),t.eventType){case r.EVENT_START:this.triggered=!1;break;case r.EVENT_MOVE:var i=Math.abs(1-t.scale),o=Math.abs(t.rotation);if(n.options.transform_min_scale>i&&n.options.transform_min_rotation>o)return;r.detection.current.name=this.name,this.triggered||(n.trigger(this.name+"start",t),this.triggered=!0),n.trigger(this.name,t),o>n.options.transform_min_rotation&&n.trigger("rotate",t),i>n.options.transform_min_scale&&(n.trigger("pinch",t),n.trigger("pinch"+(1>t.scale?"in":"out"),t));break;case r.EVENT_END:this.triggered&&n.trigger(this.name+"end",t),this.triggered=!1}}},r.gestures.Touch={name:"touch",index:-1/0,defaults:{prevent_default:!1,prevent_mouseevents:!1},handler:function(t,n){return n.options.prevent_mouseevents&&t.pointerType==r.POINTER_MOUSE?(t.stopDetect(),e):(n.options.prevent_default&&t.preventDefault(),t.eventType==r.EVENT_START&&n.trigger(this.name,t),e)}},r.gestures.Release={name:"release",index:1/0,handler:function(t,e){t.eventType==r.EVENT_END&&e.trigger(this.name,t)}},"object"==typeof module&&"object"==typeof module.exports?module.exports=r:(t.Hammer=r,"function"==typeof t.define&&t.define.amd&&t.define("hammer",[],function(){return r}))})(this),function(t,e){"use strict";t!==e&&(Hammer.event.bindDom=function(n,r,i){t(n).on(r,function(t){var n=t.originalEvent||t;n.pageX===e&&(n.pageX=t.pageX,n.pageY=t.pageY),n.target||(n.target=t.target),n.which===e&&(n.which=n.button),n.preventDefault||(n.preventDefault=t.preventDefault),n.stopPropagation||(n.stopPropagation=t.stopPropagation),i.call(this,n)})},Hammer.Instance.prototype.on=function(e,n){return t(this.element).on(e,n)},Hammer.Instance.prototype.off=function(e,n){return t(this.element).off(e,n)},Hammer.Instance.prototype.trigger=function(e,n){var r=t(this.element);return r.has(n.target).length&&(r=t(n.target)),r.trigger({type:e,gesture:n})},t.fn.hammer=function(e){return this.each(function(){var n=t(this),r=n.data("hammer");r?r&&e&&Hammer.utils.extend(r.options,e):n.data("hammer",new Hammer(this,e||{}))})})}(window.jQuery||window.Zepto);
/*
 * jQuery Hotkeys Plugin
 * Copyright 2010, John Resig
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * Based upon the plugin by Tzury Bar Yochay:
 * http://github.com/tzuryby/hotkeys
 *
 * Original idea by:
 * Binny V A, http://www.openjs.com/scripts/events/keyboard_shortcuts/
*/

(function(jQuery){
	
	jQuery.hotkeys = {
		version: "0.8",

		specialKeys: {
			8: "backspace", 9: "tab", 13: "return", 16: "shift", 17: "ctrl", 18: "alt", 19: "pause",
			20: "capslock", 27: "esc", 32: "space", 33: "pageup", 34: "pagedown", 35: "end", 36: "home",
			37: "left", 38: "up", 39: "right", 40: "down", 45: "insert", 46: "del", 
			96: "0", 97: "1", 98: "2", 99: "3", 100: "4", 101: "5", 102: "6", 103: "7",
			104: "8", 105: "9", 106: "*", 107: "+", 109: "-", 110: ".", 111 : "/", 
			112: "f1", 113: "f2", 114: "f3", 115: "f4", 116: "f5", 117: "f6", 118: "f7", 119: "f8", 
			120: "f9", 121: "f10", 122: "f11", 123: "f12", 144: "numlock", 145: "scroll", 191: "/", 224: "meta"
		},
	
		shiftNums: {
			"`": "~", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", 
			"8": "*", "9": "(", "0": ")", "-": "_", "=": "+", ";": ": ", "'": "\"", ",": "<", 
			".": ">",  "/": "?",  "\\": "|"
		}
	};

	function keyHandler( handleObj ) {
		// Only care when a possible input has been specified
		if ( typeof handleObj.data !== "string" ) {
			return;
		}
		
		var origHandler = handleObj.handler,
			keys = handleObj.data.toLowerCase().split(" "),
			textAcceptingInputTypes = ["text", "password", "number", "email", "url", "range", "date", "month", "week", "time", "datetime", "datetime-local", "search", "color"];
	
		handleObj.handler = function( event ) {
			// Don't fire in text-accepting inputs that we didn't directly bind to
			if ( this !== event.target && (/textarea|select/i.test( event.target.nodeName ) ||
				jQuery.inArray(event.target.type, textAcceptingInputTypes) > -1 ) ) {
				return;
			}
			
			// Keypress represents characters, not special keys
			var special = event.type !== "keypress" && jQuery.hotkeys.specialKeys[ event.which ],
				character = String.fromCharCode( event.which ).toLowerCase(),
				key, modif = "", possible = {};

			// check combinations (alt|ctrl|shift+anything)
			if ( event.altKey && special !== "alt" ) {
				modif += "alt+";
			}

			if ( event.ctrlKey && special !== "ctrl" ) {
				modif += "ctrl+";
			}
			
			// TODO: Need to make sure this works consistently across platforms
			if ( event.metaKey && !event.ctrlKey && special !== "meta" ) {
				modif += "meta+";
			}

			if ( event.shiftKey && special !== "shift" ) {
				modif += "shift+";
			}

			if ( special ) {
				possible[ modif + special ] = true;

			} else {
				possible[ modif + character ] = true;
				possible[ modif + jQuery.hotkeys.shiftNums[ character ] ] = true;

				// "$" can be triggered as "Shift+4" or "Shift+$" or just "$"
				if ( modif === "shift+" ) {
					possible[ jQuery.hotkeys.shiftNums[ character ] ] = true;
				}
			}

			for ( var i = 0, l = keys.length; i < l; i++ ) {
				if ( possible[ keys[i] ] ) {
					return origHandler.apply( this, arguments );
				}
			}
		};
	}

	jQuery.each([ "keydown", "keyup", "keypress" ], function() {
		jQuery.event.special[ this ] = { add: keyHandler };
	});

})( jQuery );
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

(function(){var n=this,t=n._,r={},e=Array.prototype,u=Object.prototype,i=Function.prototype,a=e.push,o=e.slice,c=e.concat,l=u.toString,f=u.hasOwnProperty,s=e.forEach,p=e.map,h=e.reduce,v=e.reduceRight,d=e.filter,g=e.every,m=e.some,y=e.indexOf,b=e.lastIndexOf,x=Array.isArray,_=Object.keys,j=i.bind,w=function(n){return n instanceof w?n:this instanceof w?(this._wrapped=n,void 0):new w(n)};"undefined"!=typeof exports?("undefined"!=typeof module&&module.exports&&(exports=module.exports=w),exports._=w):n._=w,w.VERSION="1.4.4";var A=w.each=w.forEach=function(n,t,e){if(null!=n)if(s&&n.forEach===s)n.forEach(t,e);else if(n.length===+n.length){for(var u=0,i=n.length;i>u;u++)if(t.call(e,n[u],u,n)===r)return}else for(var a in n)if(w.has(n,a)&&t.call(e,n[a],a,n)===r)return};w.map=w.collect=function(n,t,r){var e=[];return null==n?e:p&&n.map===p?n.map(t,r):(A(n,function(n,u,i){e[e.length]=t.call(r,n,u,i)}),e)};var O="Reduce of empty array with no initial value";w.reduce=w.foldl=w.inject=function(n,t,r,e){var u=arguments.length>2;if(null==n&&(n=[]),h&&n.reduce===h)return e&&(t=w.bind(t,e)),u?n.reduce(t,r):n.reduce(t);if(A(n,function(n,i,a){u?r=t.call(e,r,n,i,a):(r=n,u=!0)}),!u)throw new TypeError(O);return r},w.reduceRight=w.foldr=function(n,t,r,e){var u=arguments.length>2;if(null==n&&(n=[]),v&&n.reduceRight===v)return e&&(t=w.bind(t,e)),u?n.reduceRight(t,r):n.reduceRight(t);var i=n.length;if(i!==+i){var a=w.keys(n);i=a.length}if(A(n,function(o,c,l){c=a?a[--i]:--i,u?r=t.call(e,r,n[c],c,l):(r=n[c],u=!0)}),!u)throw new TypeError(O);return r},w.find=w.detect=function(n,t,r){var e;return E(n,function(n,u,i){return t.call(r,n,u,i)?(e=n,!0):void 0}),e},w.filter=w.select=function(n,t,r){var e=[];return null==n?e:d&&n.filter===d?n.filter(t,r):(A(n,function(n,u,i){t.call(r,n,u,i)&&(e[e.length]=n)}),e)},w.reject=function(n,t,r){return w.filter(n,function(n,e,u){return!t.call(r,n,e,u)},r)},w.every=w.all=function(n,t,e){t||(t=w.identity);var u=!0;return null==n?u:g&&n.every===g?n.every(t,e):(A(n,function(n,i,a){return(u=u&&t.call(e,n,i,a))?void 0:r}),!!u)};var E=w.some=w.any=function(n,t,e){t||(t=w.identity);var u=!1;return null==n?u:m&&n.some===m?n.some(t,e):(A(n,function(n,i,a){return u||(u=t.call(e,n,i,a))?r:void 0}),!!u)};w.contains=w.include=function(n,t){return null==n?!1:y&&n.indexOf===y?n.indexOf(t)!=-1:E(n,function(n){return n===t})},w.invoke=function(n,t){var r=o.call(arguments,2),e=w.isFunction(t);return w.map(n,function(n){return(e?t:n[t]).apply(n,r)})},w.pluck=function(n,t){return w.map(n,function(n){return n[t]})},w.where=function(n,t,r){return w.isEmpty(t)?r?null:[]:w[r?"find":"filter"](n,function(n){for(var r in t)if(t[r]!==n[r])return!1;return!0})},w.findWhere=function(n,t){return w.where(n,t,!0)},w.max=function(n,t,r){if(!t&&w.isArray(n)&&n[0]===+n[0]&&65535>n.length)return Math.max.apply(Math,n);if(!t&&w.isEmpty(n))return-1/0;var e={computed:-1/0,value:-1/0};return A(n,function(n,u,i){var a=t?t.call(r,n,u,i):n;a>=e.computed&&(e={value:n,computed:a})}),e.value},w.min=function(n,t,r){if(!t&&w.isArray(n)&&n[0]===+n[0]&&65535>n.length)return Math.min.apply(Math,n);if(!t&&w.isEmpty(n))return 1/0;var e={computed:1/0,value:1/0};return A(n,function(n,u,i){var a=t?t.call(r,n,u,i):n;e.computed>a&&(e={value:n,computed:a})}),e.value},w.shuffle=function(n){var t,r=0,e=[];return A(n,function(n){t=w.random(r++),e[r-1]=e[t],e[t]=n}),e};var k=function(n){return w.isFunction(n)?n:function(t){return t[n]}};w.sortBy=function(n,t,r){var e=k(t);return w.pluck(w.map(n,function(n,t,u){return{value:n,index:t,criteria:e.call(r,n,t,u)}}).sort(function(n,t){var r=n.criteria,e=t.criteria;if(r!==e){if(r>e||r===void 0)return 1;if(e>r||e===void 0)return-1}return n.index<t.index?-1:1}),"value")};var F=function(n,t,r,e){var u={},i=k(t||w.identity);return A(n,function(t,a){var o=i.call(r,t,a,n);e(u,o,t)}),u};w.groupBy=function(n,t,r){return F(n,t,r,function(n,t,r){(w.has(n,t)?n[t]:n[t]=[]).push(r)})},w.countBy=function(n,t,r){return F(n,t,r,function(n,t){w.has(n,t)||(n[t]=0),n[t]++})},w.sortedIndex=function(n,t,r,e){r=null==r?w.identity:k(r);for(var u=r.call(e,t),i=0,a=n.length;a>i;){var o=i+a>>>1;u>r.call(e,n[o])?i=o+1:a=o}return i},w.toArray=function(n){return n?w.isArray(n)?o.call(n):n.length===+n.length?w.map(n,w.identity):w.values(n):[]},w.size=function(n){return null==n?0:n.length===+n.length?n.length:w.keys(n).length},w.first=w.head=w.take=function(n,t,r){return null==n?void 0:null==t||r?n[0]:o.call(n,0,t)},w.initial=function(n,t,r){return o.call(n,0,n.length-(null==t||r?1:t))},w.last=function(n,t,r){return null==n?void 0:null==t||r?n[n.length-1]:o.call(n,Math.max(n.length-t,0))},w.rest=w.tail=w.drop=function(n,t,r){return o.call(n,null==t||r?1:t)},w.compact=function(n){return w.filter(n,w.identity)};var R=function(n,t,r){return A(n,function(n){w.isArray(n)?t?a.apply(r,n):R(n,t,r):r.push(n)}),r};w.flatten=function(n,t){return R(n,t,[])},w.without=function(n){return w.difference(n,o.call(arguments,1))},w.uniq=w.unique=function(n,t,r,e){w.isFunction(t)&&(e=r,r=t,t=!1);var u=r?w.map(n,r,e):n,i=[],a=[];return A(u,function(r,e){(t?e&&a[a.length-1]===r:w.contains(a,r))||(a.push(r),i.push(n[e]))}),i},w.union=function(){return w.uniq(c.apply(e,arguments))},w.intersection=function(n){var t=o.call(arguments,1);return w.filter(w.uniq(n),function(n){return w.every(t,function(t){return w.indexOf(t,n)>=0})})},w.difference=function(n){var t=c.apply(e,o.call(arguments,1));return w.filter(n,function(n){return!w.contains(t,n)})},w.zip=function(){for(var n=o.call(arguments),t=w.max(w.pluck(n,"length")),r=Array(t),e=0;t>e;e++)r[e]=w.pluck(n,""+e);return r},w.object=function(n,t){if(null==n)return{};for(var r={},e=0,u=n.length;u>e;e++)t?r[n[e]]=t[e]:r[n[e][0]]=n[e][1];return r},w.indexOf=function(n,t,r){if(null==n)return-1;var e=0,u=n.length;if(r){if("number"!=typeof r)return e=w.sortedIndex(n,t),n[e]===t?e:-1;e=0>r?Math.max(0,u+r):r}if(y&&n.indexOf===y)return n.indexOf(t,r);for(;u>e;e++)if(n[e]===t)return e;return-1},w.lastIndexOf=function(n,t,r){if(null==n)return-1;var e=null!=r;if(b&&n.lastIndexOf===b)return e?n.lastIndexOf(t,r):n.lastIndexOf(t);for(var u=e?r:n.length;u--;)if(n[u]===t)return u;return-1},w.range=function(n,t,r){1>=arguments.length&&(t=n||0,n=0),r=arguments[2]||1;for(var e=Math.max(Math.ceil((t-n)/r),0),u=0,i=Array(e);e>u;)i[u++]=n,n+=r;return i},w.bind=function(n,t){if(n.bind===j&&j)return j.apply(n,o.call(arguments,1));var r=o.call(arguments,2);return function(){return n.apply(t,r.concat(o.call(arguments)))}},w.partial=function(n){var t=o.call(arguments,1);return function(){return n.apply(this,t.concat(o.call(arguments)))}},w.bindAll=function(n){var t=o.call(arguments,1);return 0===t.length&&(t=w.functions(n)),A(t,function(t){n[t]=w.bind(n[t],n)}),n},w.memoize=function(n,t){var r={};return t||(t=w.identity),function(){var e=t.apply(this,arguments);return w.has(r,e)?r[e]:r[e]=n.apply(this,arguments)}},w.delay=function(n,t){var r=o.call(arguments,2);return setTimeout(function(){return n.apply(null,r)},t)},w.defer=function(n){return w.delay.apply(w,[n,1].concat(o.call(arguments,1)))},w.throttle=function(n,t){var r,e,u,i,a=0,o=function(){a=new Date,u=null,i=n.apply(r,e)};return function(){var c=new Date,l=t-(c-a);return r=this,e=arguments,0>=l?(clearTimeout(u),u=null,a=c,i=n.apply(r,e)):u||(u=setTimeout(o,l)),i}},w.debounce=function(n,t,r){var e,u;return function(){var i=this,a=arguments,o=function(){e=null,r||(u=n.apply(i,a))},c=r&&!e;return clearTimeout(e),e=setTimeout(o,t),c&&(u=n.apply(i,a)),u}},w.once=function(n){var t,r=!1;return function(){return r?t:(r=!0,t=n.apply(this,arguments),n=null,t)}},w.wrap=function(n,t){return function(){var r=[n];return a.apply(r,arguments),t.apply(this,r)}},w.compose=function(){var n=arguments;return function(){for(var t=arguments,r=n.length-1;r>=0;r--)t=[n[r].apply(this,t)];return t[0]}},w.after=function(n,t){return 0>=n?t():function(){return 1>--n?t.apply(this,arguments):void 0}},w.keys=_||function(n){if(n!==Object(n))throw new TypeError("Invalid object");var t=[];for(var r in n)w.has(n,r)&&(t[t.length]=r);return t},w.values=function(n){var t=[];for(var r in n)w.has(n,r)&&t.push(n[r]);return t},w.pairs=function(n){var t=[];for(var r in n)w.has(n,r)&&t.push([r,n[r]]);return t},w.invert=function(n){var t={};for(var r in n)w.has(n,r)&&(t[n[r]]=r);return t},w.functions=w.methods=function(n){var t=[];for(var r in n)w.isFunction(n[r])&&t.push(r);return t.sort()},w.extend=function(n){return A(o.call(arguments,1),function(t){if(t)for(var r in t)n[r]=t[r]}),n},w.pick=function(n){var t={},r=c.apply(e,o.call(arguments,1));return A(r,function(r){r in n&&(t[r]=n[r])}),t},w.omit=function(n){var t={},r=c.apply(e,o.call(arguments,1));for(var u in n)w.contains(r,u)||(t[u]=n[u]);return t},w.defaults=function(n){return A(o.call(arguments,1),function(t){if(t)for(var r in t)null==n[r]&&(n[r]=t[r])}),n},w.clone=function(n){return w.isObject(n)?w.isArray(n)?n.slice():w.extend({},n):n},w.tap=function(n,t){return t(n),n};var I=function(n,t,r,e){if(n===t)return 0!==n||1/n==1/t;if(null==n||null==t)return n===t;n instanceof w&&(n=n._wrapped),t instanceof w&&(t=t._wrapped);var u=l.call(n);if(u!=l.call(t))return!1;switch(u){case"[object String]":return n==t+"";case"[object Number]":return n!=+n?t!=+t:0==n?1/n==1/t:n==+t;case"[object Date]":case"[object Boolean]":return+n==+t;case"[object RegExp]":return n.source==t.source&&n.global==t.global&&n.multiline==t.multiline&&n.ignoreCase==t.ignoreCase}if("object"!=typeof n||"object"!=typeof t)return!1;for(var i=r.length;i--;)if(r[i]==n)return e[i]==t;r.push(n),e.push(t);var a=0,o=!0;if("[object Array]"==u){if(a=n.length,o=a==t.length)for(;a--&&(o=I(n[a],t[a],r,e)););}else{var c=n.constructor,f=t.constructor;if(c!==f&&!(w.isFunction(c)&&c instanceof c&&w.isFunction(f)&&f instanceof f))return!1;for(var s in n)if(w.has(n,s)&&(a++,!(o=w.has(t,s)&&I(n[s],t[s],r,e))))break;if(o){for(s in t)if(w.has(t,s)&&!a--)break;o=!a}}return r.pop(),e.pop(),o};w.isEqual=function(n,t){return I(n,t,[],[])},w.isEmpty=function(n){if(null==n)return!0;if(w.isArray(n)||w.isString(n))return 0===n.length;for(var t in n)if(w.has(n,t))return!1;return!0},w.isElement=function(n){return!(!n||1!==n.nodeType)},w.isArray=x||function(n){return"[object Array]"==l.call(n)},w.isObject=function(n){return n===Object(n)},A(["Arguments","Function","String","Number","Date","RegExp"],function(n){w["is"+n]=function(t){return l.call(t)=="[object "+n+"]"}}),w.isArguments(arguments)||(w.isArguments=function(n){return!(!n||!w.has(n,"callee"))}),"function"!=typeof/./&&(w.isFunction=function(n){return"function"==typeof n}),w.isFinite=function(n){return isFinite(n)&&!isNaN(parseFloat(n))},w.isNaN=function(n){return w.isNumber(n)&&n!=+n},w.isBoolean=function(n){return n===!0||n===!1||"[object Boolean]"==l.call(n)},w.isNull=function(n){return null===n},w.isUndefined=function(n){return n===void 0},w.has=function(n,t){return f.call(n,t)},w.noConflict=function(){return n._=t,this},w.identity=function(n){return n},w.times=function(n,t,r){for(var e=Array(n),u=0;n>u;u++)e[u]=t.call(r,u);return e},w.random=function(n,t){return null==t&&(t=n,n=0),n+Math.floor(Math.random()*(t-n+1))};var M={escape:{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","/":"&#x2F;"}};M.unescape=w.invert(M.escape);var S={escape:RegExp("["+w.keys(M.escape).join("")+"]","g"),unescape:RegExp("("+w.keys(M.unescape).join("|")+")","g")};w.each(["escape","unescape"],function(n){w[n]=function(t){return null==t?"":(""+t).replace(S[n],function(t){return M[n][t]})}}),w.result=function(n,t){if(null==n)return null;var r=n[t];return w.isFunction(r)?r.call(n):r},w.mixin=function(n){A(w.functions(n),function(t){var r=w[t]=n[t];w.prototype[t]=function(){var n=[this._wrapped];return a.apply(n,arguments),D.call(this,r.apply(w,n))}})};var N=0;w.uniqueId=function(n){var t=++N+"";return n?n+t:t},w.templateSettings={evaluate:/<%([\s\S]+?)%>/g,interpolate:/<%=([\s\S]+?)%>/g,escape:/<%-([\s\S]+?)%>/g};var T=/(.)^/,q={"'":"'","\\":"\\","\r":"r","\n":"n","	":"t","\u2028":"u2028","\u2029":"u2029"},B=/\\|'|\r|\n|\t|\u2028|\u2029/g;w.template=function(n,t,r){var e;r=w.defaults({},r,w.templateSettings);var u=RegExp([(r.escape||T).source,(r.interpolate||T).source,(r.evaluate||T).source].join("|")+"|$","g"),i=0,a="__p+='";n.replace(u,function(t,r,e,u,o){return a+=n.slice(i,o).replace(B,function(n){return"\\"+q[n]}),r&&(a+="'+\n((__t=("+r+"))==null?'':_.escape(__t))+\n'"),e&&(a+="'+\n((__t=("+e+"))==null?'':__t)+\n'"),u&&(a+="';\n"+u+"\n__p+='"),i=o+t.length,t}),a+="';\n",r.variable||(a="with(obj||{}){\n"+a+"}\n"),a="var __t,__p='',__j=Array.prototype.join,"+"print=function(){__p+=__j.call(arguments,'');};\n"+a+"return __p;\n";try{e=Function(r.variable||"obj","_",a)}catch(o){throw o.source=a,o}if(t)return e(t,w);var c=function(n){return e.call(this,n,w)};return c.source="function("+(r.variable||"obj")+"){\n"+a+"}",c},w.chain=function(n){return w(n).chain()};var D=function(n){return this._chain?w(n).chain():n};w.mixin(w),A(["pop","push","reverse","shift","sort","splice","unshift"],function(n){var t=e[n];w.prototype[n]=function(){var r=this._wrapped;return t.apply(r,arguments),"shift"!=n&&"splice"!=n||0!==r.length||delete r[0],D.call(this,r)}}),A(["concat","join","slice"],function(n){var t=e[n];w.prototype[n]=function(){return D.call(this,t.apply(this._wrapped,arguments))}}),w.extend(w.prototype,{chain:function(){return this._chain=!0,this},value:function(){return this._wrapped}})}).call(this);
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
