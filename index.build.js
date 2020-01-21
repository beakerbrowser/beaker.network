var main = (function (exports) {
    'use strict';

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const directives = new WeakMap();
    /**
     * Brands a function as a directive so that lit-html will call the function
     * during template rendering, rather than passing as a value.
     *
     * @param f The directive factory function. Must be a function that returns a
     * function of the signature `(part: Part) => void`. The returned function will
     * be called with the part object
     *
     * @example
     *
     * ```
     * import {directive, html} from 'lit-html';
     *
     * const immutable = directive((v) => (part) => {
     *   if (part.value !== v) {
     *     part.setValue(v)
     *   }
     * });
     * ```
     */
    // tslint:disable-next-line:no-any
    const directive = (f) => ((...args) => {
        const d = f(...args);
        directives.set(d, true);
        return d;
    });
    const isDirective = (o) => {
        return typeof o === 'function' && directives.has(o);
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * True if the custom elements polyfill is in use.
     */
    const isCEPolyfill = window.customElements !== undefined &&
        window.customElements.polyfillWrapFlushCallback !==
            undefined;
    /**
     * Reparents nodes, starting from `startNode` (inclusive) to `endNode`
     * (exclusive), into another container (could be the same container), before
     * `beforeNode`. If `beforeNode` is null, it appends the nodes to the
     * container.
     */
    const reparentNodes = (container, start, end = null, before = null) => {
        let node = start;
        while (node !== end) {
            const n = node.nextSibling;
            container.insertBefore(node, before);
            node = n;
        }
    };
    /**
     * Removes nodes, starting from `startNode` (inclusive) to `endNode`
     * (exclusive), from `container`.
     */
    const removeNodes = (container, startNode, endNode = null) => {
        let node = startNode;
        while (node !== endNode) {
            const n = node.nextSibling;
            container.removeChild(node);
            node = n;
        }
    };

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * A sentinel value that signals that a value was handled by a directive and
     * should not be written to the DOM.
     */
    const noChange = {};
    /**
     * A sentinel value that signals a NodePart to fully clear its content.
     */
    const nothing = {};

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An expression marker with embedded unique key to avoid collision with
     * possible text in templates.
     */
    const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
    /**
     * An expression marker used text-positions, multi-binding attributes, and
     * attributes with markup-like text values.
     */
    const nodeMarker = `<!--${marker}-->`;
    const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
    /**
     * Suffix appended to all bound attribute names.
     */
    const boundAttributeSuffix = '$lit$';
    /**
     * An updateable Template that tracks the location of dynamic parts.
     */
    class Template {
        constructor(result, element) {
            this.parts = [];
            this.element = element;
            let index = -1;
            let partIndex = 0;
            const nodesToRemove = [];
            const _prepareTemplate = (template) => {
                const content = template.content;
                // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be
                // null
                const walker = document.createTreeWalker(content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
                // Keeps track of the last index associated with a part. We try to delete
                // unnecessary nodes, but we never want to associate two different parts
                // to the same index. They must have a constant node between.
                let lastPartIndex = 0;
                while (walker.nextNode()) {
                    index++;
                    const node = walker.currentNode;
                    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                        if (node.hasAttributes()) {
                            const attributes = node.attributes;
                            // Per
                            // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                            // attributes are not guaranteed to be returned in document order.
                            // In particular, Edge/IE can return them out of order, so we cannot
                            // assume a correspondance between part index and attribute index.
                            let count = 0;
                            for (let i = 0; i < attributes.length; i++) {
                                if (attributes[i].value.indexOf(marker) >= 0) {
                                    count++;
                                }
                            }
                            while (count-- > 0) {
                                // Get the template literal section leading up to the first
                                // expression in this attribute
                                const stringForPart = result.strings[partIndex];
                                // Find the attribute name
                                const name = lastAttributeNameRegex.exec(stringForPart)[2];
                                // Find the corresponding attribute
                                // All bound attributes have had a suffix added in
                                // TemplateResult#getHTML to opt out of special attribute
                                // handling. To look up the attribute value we also need to add
                                // the suffix.
                                const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                                const attributeValue = node.getAttribute(attributeLookupName);
                                const strings = attributeValue.split(markerRegex);
                                this.parts.push({ type: 'attribute', index, name, strings });
                                node.removeAttribute(attributeLookupName);
                                partIndex += strings.length - 1;
                            }
                        }
                        if (node.tagName === 'TEMPLATE') {
                            _prepareTemplate(node);
                        }
                    }
                    else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                        const data = node.data;
                        if (data.indexOf(marker) >= 0) {
                            const parent = node.parentNode;
                            const strings = data.split(markerRegex);
                            const lastIndex = strings.length - 1;
                            // Generate a new text node for each literal section
                            // These nodes are also used as the markers for node parts
                            for (let i = 0; i < lastIndex; i++) {
                                parent.insertBefore((strings[i] === '') ? createMarker() :
                                    document.createTextNode(strings[i]), node);
                                this.parts.push({ type: 'node', index: ++index });
                            }
                            // If there's no text, we must insert a comment to mark our place.
                            // Else, we can trust it will stick around after cloning.
                            if (strings[lastIndex] === '') {
                                parent.insertBefore(createMarker(), node);
                                nodesToRemove.push(node);
                            }
                            else {
                                node.data = strings[lastIndex];
                            }
                            // We have a part for each match found
                            partIndex += lastIndex;
                        }
                    }
                    else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                        if (node.data === marker) {
                            const parent = node.parentNode;
                            // Add a new marker node to be the startNode of the Part if any of
                            // the following are true:
                            //  * We don't have a previousSibling
                            //  * The previousSibling is already the start of a previous part
                            if (node.previousSibling === null || index === lastPartIndex) {
                                index++;
                                parent.insertBefore(createMarker(), node);
                            }
                            lastPartIndex = index;
                            this.parts.push({ type: 'node', index });
                            // If we don't have a nextSibling, keep this node so we have an end.
                            // Else, we can remove it to save future costs.
                            if (node.nextSibling === null) {
                                node.data = '';
                            }
                            else {
                                nodesToRemove.push(node);
                                index--;
                            }
                            partIndex++;
                        }
                        else {
                            let i = -1;
                            while ((i = node.data.indexOf(marker, i + 1)) !==
                                -1) {
                                // Comment node has a binding marker inside, make an inactive part
                                // The binding won't work, but subsequent bindings will
                                // TODO (justinfagnani): consider whether it's even worth it to
                                // make bindings in comments work
                                this.parts.push({ type: 'node', index: -1 });
                            }
                        }
                    }
                }
            };
            _prepareTemplate(element);
            // Remove text binding nodes after the walk to not disturb the TreeWalker
            for (const n of nodesToRemove) {
                n.parentNode.removeChild(n);
            }
        }
    }
    const isTemplatePartActive = (part) => part.index !== -1;
    // Allows `document.createComment('')` to be renamed for a
    // small manual size-savings.
    const createMarker = () => document.createComment('');
    /**
     * This regex extracts the attribute name preceding an attribute-position
     * expression. It does this by matching the syntax allowed for attributes
     * against the string literal directly preceding the expression, assuming that
     * the expression is in an attribute-value position.
     *
     * See attributes in the HTML spec:
     * https://www.w3.org/TR/html5/syntax.html#attributes-0
     *
     * "\0-\x1F\x7F-\x9F" are Unicode control characters
     *
     * " \x09\x0a\x0c\x0d" are HTML space characters:
     * https://www.w3.org/TR/html5/infrastructure.html#space-character
     *
     * So an attribute is:
     *  * The name: any character except a control character, space character, ('),
     *    ("), ">", "=", or "/"
     *  * Followed by zero or more space characters
     *  * Followed by "="
     *  * Followed by zero or more space characters
     *  * Followed by:
     *    * Any character except space, ('), ("), "<", ">", "=", (`), or
     *    * (") then any non-("), or
     *    * (') then any non-(')
     */
    const lastAttributeNameRegex = /([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F \x09\x0a\x0c\x0d"'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An instance of a `Template` that can be attached to the DOM and updated
     * with new values.
     */
    class TemplateInstance {
        constructor(template, processor, options) {
            this._parts = [];
            this.template = template;
            this.processor = processor;
            this.options = options;
        }
        update(values) {
            let i = 0;
            for (const part of this._parts) {
                if (part !== undefined) {
                    part.setValue(values[i]);
                }
                i++;
            }
            for (const part of this._parts) {
                if (part !== undefined) {
                    part.commit();
                }
            }
        }
        _clone() {
            // When using the Custom Elements polyfill, clone the node, rather than
            // importing it, to keep the fragment in the template's document. This
            // leaves the fragment inert so custom elements won't upgrade and
            // potentially modify their contents by creating a polyfilled ShadowRoot
            // while we traverse the tree.
            const fragment = isCEPolyfill ?
                this.template.element.content.cloneNode(true) :
                document.importNode(this.template.element.content, true);
            const parts = this.template.parts;
            let partIndex = 0;
            let nodeIndex = 0;
            const _prepareInstance = (fragment) => {
                // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be
                // null
                const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
                let node = walker.nextNode();
                // Loop through all the nodes and parts of a template
                while (partIndex < parts.length && node !== null) {
                    const part = parts[partIndex];
                    // Consecutive Parts may have the same node index, in the case of
                    // multiple bound attributes on an element. So each iteration we either
                    // increment the nodeIndex, if we aren't on a node with a part, or the
                    // partIndex if we are. By not incrementing the nodeIndex when we find a
                    // part, we allow for the next part to be associated with the current
                    // node if neccessasry.
                    if (!isTemplatePartActive(part)) {
                        this._parts.push(undefined);
                        partIndex++;
                    }
                    else if (nodeIndex === part.index) {
                        if (part.type === 'node') {
                            const part = this.processor.handleTextExpression(this.options);
                            part.insertAfterNode(node.previousSibling);
                            this._parts.push(part);
                        }
                        else {
                            this._parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
                        }
                        partIndex++;
                    }
                    else {
                        nodeIndex++;
                        if (node.nodeName === 'TEMPLATE') {
                            _prepareInstance(node.content);
                        }
                        node = walker.nextNode();
                    }
                }
            };
            _prepareInstance(fragment);
            if (isCEPolyfill) {
                document.adoptNode(fragment);
                customElements.upgrade(fragment);
            }
            return fragment;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * The return type of `html`, which holds a Template and the values from
     * interpolated expressions.
     */
    class TemplateResult {
        constructor(strings, values, type, processor) {
            this.strings = strings;
            this.values = values;
            this.type = type;
            this.processor = processor;
        }
        /**
         * Returns a string of HTML used to create a `<template>` element.
         */
        getHTML() {
            const endIndex = this.strings.length - 1;
            let html = '';
            for (let i = 0; i < endIndex; i++) {
                const s = this.strings[i];
                // This exec() call does two things:
                // 1) Appends a suffix to the bound attribute name to opt out of special
                // attribute value parsing that IE11 and Edge do, like for style and
                // many SVG attributes. The Template class also appends the same suffix
                // when looking up attributes to create Parts.
                // 2) Adds an unquoted-attribute-safe marker for the first expression in
                // an attribute. Subsequent attribute expressions will use node markers,
                // and this is safe since attributes with multiple expressions are
                // guaranteed to be quoted.
                const match = lastAttributeNameRegex.exec(s);
                if (match) {
                    // We're starting a new bound attribute.
                    // Add the safe attribute suffix, and use unquoted-attribute-safe
                    // marker.
                    html += s.substr(0, match.index) + match[1] + match[2] +
                        boundAttributeSuffix + match[3] + marker;
                }
                else {
                    // We're either in a bound node, or trailing bound attribute.
                    // Either way, nodeMarker is safe to use.
                    html += s + nodeMarker;
                }
            }
            return html + this.strings[endIndex];
        }
        getTemplateElement() {
            const template = document.createElement('template');
            template.innerHTML = this.getHTML();
            return template;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const isPrimitive = (value) => {
        return (value === null ||
            !(typeof value === 'object' || typeof value === 'function'));
    };
    /**
     * Sets attribute values for AttributeParts, so that the value is only set once
     * even if there are multiple parts for an attribute.
     */
    class AttributeCommitter {
        constructor(element, name, strings) {
            this.dirty = true;
            this.element = element;
            this.name = name;
            this.strings = strings;
            this.parts = [];
            for (let i = 0; i < strings.length - 1; i++) {
                this.parts[i] = this._createPart();
            }
        }
        /**
         * Creates a single part. Override this to create a differnt type of part.
         */
        _createPart() {
            return new AttributePart(this);
        }
        _getValue() {
            const strings = this.strings;
            const l = strings.length - 1;
            let text = '';
            for (let i = 0; i < l; i++) {
                text += strings[i];
                const part = this.parts[i];
                if (part !== undefined) {
                    const v = part.value;
                    if (v != null &&
                        (Array.isArray(v) ||
                            // tslint:disable-next-line:no-any
                            typeof v !== 'string' && v[Symbol.iterator])) {
                        for (const t of v) {
                            text += typeof t === 'string' ? t : String(t);
                        }
                    }
                    else {
                        text += typeof v === 'string' ? v : String(v);
                    }
                }
            }
            text += strings[l];
            return text;
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                this.element.setAttribute(this.name, this._getValue());
            }
        }
    }
    class AttributePart {
        constructor(comitter) {
            this.value = undefined;
            this.committer = comitter;
        }
        setValue(value) {
            if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
                this.value = value;
                // If the value is a not a directive, dirty the committer so that it'll
                // call setAttribute. If the value is a directive, it'll dirty the
                // committer if it calls setValue().
                if (!isDirective(value)) {
                    this.committer.dirty = true;
                }
            }
        }
        commit() {
            while (isDirective(this.value)) {
                const directive = this.value;
                this.value = noChange;
                directive(this);
            }
            if (this.value === noChange) {
                return;
            }
            this.committer.commit();
        }
    }
    class NodePart {
        constructor(options) {
            this.value = undefined;
            this._pendingValue = undefined;
            this.options = options;
        }
        /**
         * Inserts this part into a container.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendInto(container) {
            this.startNode = container.appendChild(createMarker());
            this.endNode = container.appendChild(createMarker());
        }
        /**
         * Inserts this part between `ref` and `ref`'s next sibling. Both `ref` and
         * its next sibling must be static, unchanging nodes such as those that appear
         * in a literal section of a template.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterNode(ref) {
            this.startNode = ref;
            this.endNode = ref.nextSibling;
        }
        /**
         * Appends this part into a parent part.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendIntoPart(part) {
            part._insert(this.startNode = createMarker());
            part._insert(this.endNode = createMarker());
        }
        /**
         * Appends this part after `ref`
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterPart(ref) {
            ref._insert(this.startNode = createMarker());
            this.endNode = ref.endNode;
            ref.endNode = this.startNode;
        }
        setValue(value) {
            this._pendingValue = value;
        }
        commit() {
            while (isDirective(this._pendingValue)) {
                const directive = this._pendingValue;
                this._pendingValue = noChange;
                directive(this);
            }
            const value = this._pendingValue;
            if (value === noChange) {
                return;
            }
            if (isPrimitive(value)) {
                if (value !== this.value) {
                    this._commitText(value);
                }
            }
            else if (value instanceof TemplateResult) {
                this._commitTemplateResult(value);
            }
            else if (value instanceof Node) {
                this._commitNode(value);
            }
            else if (Array.isArray(value) ||
                // tslint:disable-next-line:no-any
                value[Symbol.iterator]) {
                this._commitIterable(value);
            }
            else if (value === nothing) {
                this.value = nothing;
                this.clear();
            }
            else {
                // Fallback, will render the string representation
                this._commitText(value);
            }
        }
        _insert(node) {
            this.endNode.parentNode.insertBefore(node, this.endNode);
        }
        _commitNode(value) {
            if (this.value === value) {
                return;
            }
            this.clear();
            this._insert(value);
            this.value = value;
        }
        _commitText(value) {
            const node = this.startNode.nextSibling;
            value = value == null ? '' : value;
            if (node === this.endNode.previousSibling &&
                node.nodeType === 3 /* Node.TEXT_NODE */) {
                // If we only have a single text node between the markers, we can just
                // set its value, rather than replacing it.
                // TODO(justinfagnani): Can we just check if this.value is primitive?
                node.data = value;
            }
            else {
                this._commitNode(document.createTextNode(typeof value === 'string' ? value : String(value)));
            }
            this.value = value;
        }
        _commitTemplateResult(value) {
            const template = this.options.templateFactory(value);
            if (this.value instanceof TemplateInstance &&
                this.value.template === template) {
                this.value.update(value.values);
            }
            else {
                // Make sure we propagate the template processor from the TemplateResult
                // so that we use its syntax extension, etc. The template factory comes
                // from the render function options so that it can control template
                // caching and preprocessing.
                const instance = new TemplateInstance(template, value.processor, this.options);
                const fragment = instance._clone();
                instance.update(value.values);
                this._commitNode(fragment);
                this.value = instance;
            }
        }
        _commitIterable(value) {
            // For an Iterable, we create a new InstancePart per item, then set its
            // value to the item. This is a little bit of overhead for every item in
            // an Iterable, but it lets us recurse easily and efficiently update Arrays
            // of TemplateResults that will be commonly returned from expressions like:
            // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
            // If _value is an array, then the previous render was of an
            // iterable and _value will contain the NodeParts from the previous
            // render. If _value is not an array, clear this part and make a new
            // array for NodeParts.
            if (!Array.isArray(this.value)) {
                this.value = [];
                this.clear();
            }
            // Lets us keep track of how many items we stamped so we can clear leftover
            // items from a previous render
            const itemParts = this.value;
            let partIndex = 0;
            let itemPart;
            for (const item of value) {
                // Try to reuse an existing part
                itemPart = itemParts[partIndex];
                // If no existing part, create a new one
                if (itemPart === undefined) {
                    itemPart = new NodePart(this.options);
                    itemParts.push(itemPart);
                    if (partIndex === 0) {
                        itemPart.appendIntoPart(this);
                    }
                    else {
                        itemPart.insertAfterPart(itemParts[partIndex - 1]);
                    }
                }
                itemPart.setValue(item);
                itemPart.commit();
                partIndex++;
            }
            if (partIndex < itemParts.length) {
                // Truncate the parts array so _value reflects the current state
                itemParts.length = partIndex;
                this.clear(itemPart && itemPart.endNode);
            }
        }
        clear(startNode = this.startNode) {
            removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
        }
    }
    /**
     * Implements a boolean attribute, roughly as defined in the HTML
     * specification.
     *
     * If the value is truthy, then the attribute is present with a value of
     * ''. If the value is falsey, the attribute is removed.
     */
    class BooleanAttributePart {
        constructor(element, name, strings) {
            this.value = undefined;
            this._pendingValue = undefined;
            if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
                throw new Error('Boolean attributes can only contain a single expression');
            }
            this.element = element;
            this.name = name;
            this.strings = strings;
        }
        setValue(value) {
            this._pendingValue = value;
        }
        commit() {
            while (isDirective(this._pendingValue)) {
                const directive = this._pendingValue;
                this._pendingValue = noChange;
                directive(this);
            }
            if (this._pendingValue === noChange) {
                return;
            }
            const value = !!this._pendingValue;
            if (this.value !== value) {
                if (value) {
                    this.element.setAttribute(this.name, '');
                }
                else {
                    this.element.removeAttribute(this.name);
                }
            }
            this.value = value;
            this._pendingValue = noChange;
        }
    }
    /**
     * Sets attribute values for PropertyParts, so that the value is only set once
     * even if there are multiple parts for a property.
     *
     * If an expression controls the whole property value, then the value is simply
     * assigned to the property under control. If there are string literals or
     * multiple expressions, then the strings are expressions are interpolated into
     * a string first.
     */
    class PropertyCommitter extends AttributeCommitter {
        constructor(element, name, strings) {
            super(element, name, strings);
            this.single =
                (strings.length === 2 && strings[0] === '' && strings[1] === '');
        }
        _createPart() {
            return new PropertyPart(this);
        }
        _getValue() {
            if (this.single) {
                return this.parts[0].value;
            }
            return super._getValue();
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                // tslint:disable-next-line:no-any
                this.element[this.name] = this._getValue();
            }
        }
    }
    class PropertyPart extends AttributePart {
    }
    // Detect event listener options support. If the `capture` property is read
    // from the options object, then options are supported. If not, then the thrid
    // argument to add/removeEventListener is interpreted as the boolean capture
    // value so we should only pass the `capture` property.
    let eventOptionsSupported = false;
    try {
        const options = {
            get capture() {
                eventOptionsSupported = true;
                return false;
            }
        };
        // tslint:disable-next-line:no-any
        window.addEventListener('test', options, options);
        // tslint:disable-next-line:no-any
        window.removeEventListener('test', options, options);
    }
    catch (_e) {
    }
    class EventPart {
        constructor(element, eventName, eventContext) {
            this.value = undefined;
            this._pendingValue = undefined;
            this.element = element;
            this.eventName = eventName;
            this.eventContext = eventContext;
            this._boundHandleEvent = (e) => this.handleEvent(e);
        }
        setValue(value) {
            this._pendingValue = value;
        }
        commit() {
            while (isDirective(this._pendingValue)) {
                const directive = this._pendingValue;
                this._pendingValue = noChange;
                directive(this);
            }
            if (this._pendingValue === noChange) {
                return;
            }
            const newListener = this._pendingValue;
            const oldListener = this.value;
            const shouldRemoveListener = newListener == null ||
                oldListener != null &&
                    (newListener.capture !== oldListener.capture ||
                        newListener.once !== oldListener.once ||
                        newListener.passive !== oldListener.passive);
            const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
            if (shouldRemoveListener) {
                this.element.removeEventListener(this.eventName, this._boundHandleEvent, this._options);
            }
            if (shouldAddListener) {
                this._options = getOptions(newListener);
                this.element.addEventListener(this.eventName, this._boundHandleEvent, this._options);
            }
            this.value = newListener;
            this._pendingValue = noChange;
        }
        handleEvent(event) {
            if (typeof this.value === 'function') {
                this.value.call(this.eventContext || this.element, event);
            }
            else {
                this.value.handleEvent(event);
            }
        }
    }
    // We copy options because of the inconsistent behavior of browsers when reading
    // the third argument of add/removeEventListener. IE11 doesn't support options
    // at all. Chrome 41 only reads `capture` if the argument is an object.
    const getOptions = (o) => o &&
        (eventOptionsSupported ?
            { capture: o.capture, passive: o.passive, once: o.once } :
            o.capture);

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * Creates Parts when a template is instantiated.
     */
    class DefaultTemplateProcessor {
        /**
         * Create parts for an attribute-position binding, given the event, attribute
         * name, and string literals.
         *
         * @param element The element containing the binding
         * @param name  The attribute name
         * @param strings The string literals. There are always at least two strings,
         *   event for fully-controlled bindings with a single expression.
         */
        handleAttributeExpressions(element, name, strings, options) {
            const prefix = name[0];
            if (prefix === '.') {
                const comitter = new PropertyCommitter(element, name.slice(1), strings);
                return comitter.parts;
            }
            if (prefix === '@') {
                return [new EventPart(element, name.slice(1), options.eventContext)];
            }
            if (prefix === '?') {
                return [new BooleanAttributePart(element, name.slice(1), strings)];
            }
            const comitter = new AttributeCommitter(element, name, strings);
            return comitter.parts;
        }
        /**
         * Create parts for a text-position binding.
         * @param templateFactory
         */
        handleTextExpression(options) {
            return new NodePart(options);
        }
    }
    const defaultTemplateProcessor = new DefaultTemplateProcessor();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * The default TemplateFactory which caches Templates keyed on
     * result.type and result.strings.
     */
    function templateFactory(result) {
        let templateCache = templateCaches.get(result.type);
        if (templateCache === undefined) {
            templateCache = {
                stringsArray: new WeakMap(),
                keyString: new Map()
            };
            templateCaches.set(result.type, templateCache);
        }
        let template = templateCache.stringsArray.get(result.strings);
        if (template !== undefined) {
            return template;
        }
        // If the TemplateStringsArray is new, generate a key from the strings
        // This key is shared between all templates with identical content
        const key = result.strings.join(marker);
        // Check if we already have a Template for this key
        template = templateCache.keyString.get(key);
        if (template === undefined) {
            // If we have not seen this key before, create a new Template
            template = new Template(result, result.getTemplateElement());
            // Cache the Template for this key
            templateCache.keyString.set(key, template);
        }
        // Cache all future queries for this TemplateStringsArray
        templateCache.stringsArray.set(result.strings, template);
        return template;
    }
    const templateCaches = new Map();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const parts = new WeakMap();
    /**
     * Renders a template to a container.
     *
     * To update a container with new values, reevaluate the template literal and
     * call `render` with the new result.
     *
     * @param result a TemplateResult created by evaluating a template tag like
     *     `html` or `svg`.
     * @param container A DOM parent to render to. The entire contents are either
     *     replaced, or efficiently updated if the same result type was previous
     *     rendered there.
     * @param options RenderOptions for the entire render tree rendered to this
     *     container. Render options must *not* change between renders to the same
     *     container, as those changes will not effect previously rendered DOM.
     */
    const render = (result, container, options) => {
        let part = parts.get(container);
        if (part === undefined) {
            removeNodes(container, container.firstChild);
            parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
            part.appendInto(container);
        }
        part.setValue(result);
        part.commit();
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IMPORTANT: do not change the property name or the assignment expression.
    // This line will be used in regexes to search for lit-html usage.
    // TODO(justinfagnani): inject version number at build time
    (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.0.0');
    /**
     * Interprets a template literal as an HTML template that can efficiently
     * render to and update a container.
     */
    const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const walkerNodeFilter = 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */;
    /**
     * Removes the list of nodes from a Template safely. In addition to removing
     * nodes from the Template, the Template part indices are updated to match
     * the mutated Template DOM.
     *
     * As the template is walked the removal state is tracked and
     * part indices are adjusted as needed.
     *
     * div
     *   div#1 (remove) <-- start removing (removing node is div#1)
     *     div
     *       div#2 (remove)  <-- continue removing (removing node is still div#1)
     *         div
     * div <-- stop removing since previous sibling is the removing node (div#1,
     * removed 4 nodes)
     */
    function removeNodesFromTemplate(template, nodesToRemove) {
        const { element: { content }, parts } = template;
        const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
        let partIndex = nextActiveIndexInTemplateParts(parts);
        let part = parts[partIndex];
        let nodeIndex = -1;
        let removeCount = 0;
        const nodesToRemoveInTemplate = [];
        let currentRemovingNode = null;
        while (walker.nextNode()) {
            nodeIndex++;
            const node = walker.currentNode;
            // End removal if stepped past the removing node
            if (node.previousSibling === currentRemovingNode) {
                currentRemovingNode = null;
            }
            // A node to remove was found in the template
            if (nodesToRemove.has(node)) {
                nodesToRemoveInTemplate.push(node);
                // Track node we're removing
                if (currentRemovingNode === null) {
                    currentRemovingNode = node;
                }
            }
            // When removing, increment count by which to adjust subsequent part indices
            if (currentRemovingNode !== null) {
                removeCount++;
            }
            while (part !== undefined && part.index === nodeIndex) {
                // If part is in a removed node deactivate it by setting index to -1 or
                // adjust the index as needed.
                part.index = currentRemovingNode !== null ? -1 : part.index - removeCount;
                // go to the next active part.
                partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                part = parts[partIndex];
            }
        }
        nodesToRemoveInTemplate.forEach((n) => n.parentNode.removeChild(n));
    }
    const countNodes = (node) => {
        let count = (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) ? 0 : 1;
        const walker = document.createTreeWalker(node, walkerNodeFilter, null, false);
        while (walker.nextNode()) {
            count++;
        }
        return count;
    };
    const nextActiveIndexInTemplateParts = (parts, startIndex = -1) => {
        for (let i = startIndex + 1; i < parts.length; i++) {
            const part = parts[i];
            if (isTemplatePartActive(part)) {
                return i;
            }
        }
        return -1;
    };
    /**
     * Inserts the given node into the Template, optionally before the given
     * refNode. In addition to inserting the node into the Template, the Template
     * part indices are updated to match the mutated Template DOM.
     */
    function insertNodeIntoTemplate(template, node, refNode = null) {
        const { element: { content }, parts } = template;
        // If there's no refNode, then put node at end of template.
        // No part indices need to be shifted in this case.
        if (refNode === null || refNode === undefined) {
            content.appendChild(node);
            return;
        }
        const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
        let partIndex = nextActiveIndexInTemplateParts(parts);
        let insertCount = 0;
        let walkerIndex = -1;
        while (walker.nextNode()) {
            walkerIndex++;
            const walkerNode = walker.currentNode;
            if (walkerNode === refNode) {
                insertCount = countNodes(node);
                refNode.parentNode.insertBefore(node, refNode);
            }
            while (partIndex !== -1 && parts[partIndex].index === walkerIndex) {
                // If we've inserted the node, simply adjust all subsequent parts
                if (insertCount > 0) {
                    while (partIndex !== -1) {
                        parts[partIndex].index += insertCount;
                        partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                    }
                    return;
                }
                partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
            }
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // Get a key to lookup in `templateCaches`.
    const getTemplateCacheKey = (type, scopeName) => `${type}--${scopeName}`;
    let compatibleShadyCSSVersion = true;
    if (typeof window.ShadyCSS === 'undefined') {
        compatibleShadyCSSVersion = false;
    }
    else if (typeof window.ShadyCSS.prepareTemplateDom === 'undefined') {
        console.warn(`Incompatible ShadyCSS version detected.` +
            `Please update to at least @webcomponents/webcomponentsjs@2.0.2 and` +
            `@webcomponents/shadycss@1.3.1.`);
        compatibleShadyCSSVersion = false;
    }
    /**
     * Template factory which scopes template DOM using ShadyCSS.
     * @param scopeName {string}
     */
    const shadyTemplateFactory = (scopeName) => (result) => {
        const cacheKey = getTemplateCacheKey(result.type, scopeName);
        let templateCache = templateCaches.get(cacheKey);
        if (templateCache === undefined) {
            templateCache = {
                stringsArray: new WeakMap(),
                keyString: new Map()
            };
            templateCaches.set(cacheKey, templateCache);
        }
        let template = templateCache.stringsArray.get(result.strings);
        if (template !== undefined) {
            return template;
        }
        const key = result.strings.join(marker);
        template = templateCache.keyString.get(key);
        if (template === undefined) {
            const element = result.getTemplateElement();
            if (compatibleShadyCSSVersion) {
                window.ShadyCSS.prepareTemplateDom(element, scopeName);
            }
            template = new Template(result, element);
            templateCache.keyString.set(key, template);
        }
        templateCache.stringsArray.set(result.strings, template);
        return template;
    };
    const TEMPLATE_TYPES = ['html', 'svg'];
    /**
     * Removes all style elements from Templates for the given scopeName.
     */
    const removeStylesFromLitTemplates = (scopeName) => {
        TEMPLATE_TYPES.forEach((type) => {
            const templates = templateCaches.get(getTemplateCacheKey(type, scopeName));
            if (templates !== undefined) {
                templates.keyString.forEach((template) => {
                    const { element: { content } } = template;
                    // IE 11 doesn't support the iterable param Set constructor
                    const styles = new Set();
                    Array.from(content.querySelectorAll('style')).forEach((s) => {
                        styles.add(s);
                    });
                    removeNodesFromTemplate(template, styles);
                });
            }
        });
    };
    const shadyRenderSet = new Set();
    /**
     * For the given scope name, ensures that ShadyCSS style scoping is performed.
     * This is done just once per scope name so the fragment and template cannot
     * be modified.
     * (1) extracts styles from the rendered fragment and hands them to ShadyCSS
     * to be scoped and appended to the document
     * (2) removes style elements from all lit-html Templates for this scope name.
     *
     * Note, <style> elements can only be placed into templates for the
     * initial rendering of the scope. If <style> elements are included in templates
     * dynamically rendered to the scope (after the first scope render), they will
     * not be scoped and the <style> will be left in the template and rendered
     * output.
     */
    const prepareTemplateStyles = (renderedDOM, template, scopeName) => {
        shadyRenderSet.add(scopeName);
        // Move styles out of rendered DOM and store.
        const styles = renderedDOM.querySelectorAll('style');
        // If there are no styles, skip unnecessary work
        if (styles.length === 0) {
            // Ensure prepareTemplateStyles is called to support adding
            // styles via `prepareAdoptedCssText` since that requires that
            // `prepareTemplateStyles` is called.
            window.ShadyCSS.prepareTemplateStyles(template.element, scopeName);
            return;
        }
        const condensedStyle = document.createElement('style');
        // Collect styles into a single style. This helps us make sure ShadyCSS
        // manipulations will not prevent us from being able to fix up template
        // part indices.
        // NOTE: collecting styles is inefficient for browsers but ShadyCSS
        // currently does this anyway. When it does not, this should be changed.
        for (let i = 0; i < styles.length; i++) {
            const style = styles[i];
            style.parentNode.removeChild(style);
            condensedStyle.textContent += style.textContent;
        }
        // Remove styles from nested templates in this scope.
        removeStylesFromLitTemplates(scopeName);
        // And then put the condensed style into the "root" template passed in as
        // `template`.
        insertNodeIntoTemplate(template, condensedStyle, template.element.content.firstChild);
        // Note, it's important that ShadyCSS gets the template that `lit-html`
        // will actually render so that it can update the style inside when
        // needed (e.g. @apply native Shadow DOM case).
        window.ShadyCSS.prepareTemplateStyles(template.element, scopeName);
        if (window.ShadyCSS.nativeShadow) {
            // When in native Shadow DOM, re-add styling to rendered content using
            // the style ShadyCSS produced.
            const style = template.element.content.querySelector('style');
            renderedDOM.insertBefore(style.cloneNode(true), renderedDOM.firstChild);
        }
        else {
            // When not in native Shadow DOM, at this point ShadyCSS will have
            // removed the style from the lit template and parts will be broken as a
            // result. To fix this, we put back the style node ShadyCSS removed
            // and then tell lit to remove that node from the template.
            // NOTE, ShadyCSS creates its own style so we can safely add/remove
            // `condensedStyle` here.
            template.element.content.insertBefore(condensedStyle, template.element.content.firstChild);
            const removes = new Set();
            removes.add(condensedStyle);
            removeNodesFromTemplate(template, removes);
        }
    };
    /**
     * Extension to the standard `render` method which supports rendering
     * to ShadowRoots when the ShadyDOM (https://github.com/webcomponents/shadydom)
     * and ShadyCSS (https://github.com/webcomponents/shadycss) polyfills are used
     * or when the webcomponentsjs
     * (https://github.com/webcomponents/webcomponentsjs) polyfill is used.
     *
     * Adds a `scopeName` option which is used to scope element DOM and stylesheets
     * when native ShadowDOM is unavailable. The `scopeName` will be added to
     * the class attribute of all rendered DOM. In addition, any style elements will
     * be automatically re-written with this `scopeName` selector and moved out
     * of the rendered DOM and into the document `<head>`.
     *
     * It is common to use this render method in conjunction with a custom element
     * which renders a shadowRoot. When this is done, typically the element's
     * `localName` should be used as the `scopeName`.
     *
     * In addition to DOM scoping, ShadyCSS also supports a basic shim for css
     * custom properties (needed only on older browsers like IE11) and a shim for
     * a deprecated feature called `@apply` that supports applying a set of css
     * custom properties to a given location.
     *
     * Usage considerations:
     *
     * * Part values in `<style>` elements are only applied the first time a given
     * `scopeName` renders. Subsequent changes to parts in style elements will have
     * no effect. Because of this, parts in style elements should only be used for
     * values that will never change, for example parts that set scope-wide theme
     * values or parts which render shared style elements.
     *
     * * Note, due to a limitation of the ShadyDOM polyfill, rendering in a
     * custom element's `constructor` is not supported. Instead rendering should
     * either done asynchronously, for example at microtask timing (for example
     * `Promise.resolve()`), or be deferred until the first time the element's
     * `connectedCallback` runs.
     *
     * Usage considerations when using shimmed custom properties or `@apply`:
     *
     * * Whenever any dynamic changes are made which affect
     * css custom properties, `ShadyCSS.styleElement(element)` must be called
     * to update the element. There are two cases when this is needed:
     * (1) the element is connected to a new parent, (2) a class is added to the
     * element that causes it to match different custom properties.
     * To address the first case when rendering a custom element, `styleElement`
     * should be called in the element's `connectedCallback`.
     *
     * * Shimmed custom properties may only be defined either for an entire
     * shadowRoot (for example, in a `:host` rule) or via a rule that directly
     * matches an element with a shadowRoot. In other words, instead of flowing from
     * parent to child as do native css custom properties, shimmed custom properties
     * flow only from shadowRoots to nested shadowRoots.
     *
     * * When using `@apply` mixing css shorthand property names with
     * non-shorthand names (for example `border` and `border-width`) is not
     * supported.
     */
    const render$1 = (result, container, options) => {
        const scopeName = options.scopeName;
        const hasRendered = parts.has(container);
        const needsScoping = container instanceof ShadowRoot &&
            compatibleShadyCSSVersion && result instanceof TemplateResult;
        // Handle first render to a scope specially...
        const firstScopeRender = needsScoping && !shadyRenderSet.has(scopeName);
        // On first scope render, render into a fragment; this cannot be a single
        // fragment that is reused since nested renders can occur synchronously.
        const renderContainer = firstScopeRender ? document.createDocumentFragment() : container;
        render(result, renderContainer, Object.assign({ templateFactory: shadyTemplateFactory(scopeName) }, options));
        // When performing first scope render,
        // (1) We've rendered into a fragment so that there's a chance to
        // `prepareTemplateStyles` before sub-elements hit the DOM
        // (which might cause them to render based on a common pattern of
        // rendering in a custom element's `connectedCallback`);
        // (2) Scope the template with ShadyCSS one time only for this scope.
        // (3) Render the fragment into the container and make sure the
        // container knows its `part` is the one we just rendered. This ensures
        // DOM will be re-used on subsequent renders.
        if (firstScopeRender) {
            const part = parts.get(renderContainer);
            parts.delete(renderContainer);
            if (part.value instanceof TemplateInstance) {
                prepareTemplateStyles(renderContainer, part.value.template, scopeName);
            }
            removeNodes(container, container.firstChild);
            container.appendChild(renderContainer);
            parts.set(container, part);
        }
        // After elements have hit the DOM, update styling if this is the
        // initial render to this container.
        // This is needed whenever dynamic changes are made so it would be
        // safest to do every render; however, this would regress performance
        // so we leave it up to the user to call `ShadyCSSS.styleElement`
        // for dynamic changes.
        if (!hasRendered && needsScoping) {
            window.ShadyCSS.styleElement(container.host);
        }
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * When using Closure Compiler, JSCompiler_renameProperty(property, object) is
     * replaced at compile time by the munged name for object[property]. We cannot
     * alias this function, so we have to use a small shim that has the same
     * behavior when not compiling.
     */
    window.JSCompiler_renameProperty =
        (prop, _obj) => prop;
    const defaultConverter = {
        toAttribute(value, type) {
            switch (type) {
                case Boolean:
                    return value ? '' : null;
                case Object:
                case Array:
                    // if the value is `null` or `undefined` pass this through
                    // to allow removing/no change behavior.
                    return value == null ? value : JSON.stringify(value);
            }
            return value;
        },
        fromAttribute(value, type) {
            switch (type) {
                case Boolean:
                    return value !== null;
                case Number:
                    return value === null ? null : Number(value);
                case Object:
                case Array:
                    return JSON.parse(value);
            }
            return value;
        }
    };
    /**
     * Change function that returns true if `value` is different from `oldValue`.
     * This method is used as the default for a property's `hasChanged` function.
     */
    const notEqual = (value, old) => {
        // This ensures (old==NaN, value==NaN) always returns false
        return old !== value && (old === old || value === value);
    };
    const defaultPropertyDeclaration = {
        attribute: true,
        type: String,
        converter: defaultConverter,
        reflect: false,
        hasChanged: notEqual
    };
    const microtaskPromise = Promise.resolve(true);
    const STATE_HAS_UPDATED = 1;
    const STATE_UPDATE_REQUESTED = 1 << 2;
    const STATE_IS_REFLECTING_TO_ATTRIBUTE = 1 << 3;
    const STATE_IS_REFLECTING_TO_PROPERTY = 1 << 4;
    const STATE_HAS_CONNECTED = 1 << 5;
    /**
     * Base element class which manages element properties and attributes. When
     * properties change, the `update` method is asynchronously called. This method
     * should be supplied by subclassers to render updates as desired.
     */
    class UpdatingElement extends HTMLElement {
        constructor() {
            super();
            this._updateState = 0;
            this._instanceProperties = undefined;
            this._updatePromise = microtaskPromise;
            this._hasConnectedResolver = undefined;
            /**
             * Map with keys for any properties that have changed since the last
             * update cycle with previous values.
             */
            this._changedProperties = new Map();
            /**
             * Map with keys of properties that should be reflected when updated.
             */
            this._reflectingProperties = undefined;
            this.initialize();
        }
        /**
         * Returns a list of attributes corresponding to the registered properties.
         * @nocollapse
         */
        static get observedAttributes() {
            // note: piggy backing on this to ensure we're finalized.
            this.finalize();
            const attributes = [];
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            this._classProperties.forEach((v, p) => {
                const attr = this._attributeNameForProperty(p, v);
                if (attr !== undefined) {
                    this._attributeToPropertyMap.set(attr, p);
                    attributes.push(attr);
                }
            });
            return attributes;
        }
        /**
         * Ensures the private `_classProperties` property metadata is created.
         * In addition to `finalize` this is also called in `createProperty` to
         * ensure the `@property` decorator can add property metadata.
         */
        /** @nocollapse */
        static _ensureClassProperties() {
            // ensure private storage for property declarations.
            if (!this.hasOwnProperty(JSCompiler_renameProperty('_classProperties', this))) {
                this._classProperties = new Map();
                // NOTE: Workaround IE11 not supporting Map constructor argument.
                const superProperties = Object.getPrototypeOf(this)._classProperties;
                if (superProperties !== undefined) {
                    superProperties.forEach((v, k) => this._classProperties.set(k, v));
                }
            }
        }
        /**
         * Creates a property accessor on the element prototype if one does not exist.
         * The property setter calls the property's `hasChanged` property option
         * or uses a strict identity check to determine whether or not to request
         * an update.
         * @nocollapse
         */
        static createProperty(name, options = defaultPropertyDeclaration) {
            // Note, since this can be called by the `@property` decorator which
            // is called before `finalize`, we ensure storage exists for property
            // metadata.
            this._ensureClassProperties();
            this._classProperties.set(name, options);
            // Do not generate an accessor if the prototype already has one, since
            // it would be lost otherwise and that would never be the user's intention;
            // Instead, we expect users to call `requestUpdate` themselves from
            // user-defined accessors. Note that if the super has an accessor we will
            // still overwrite it
            if (options.noAccessor || this.prototype.hasOwnProperty(name)) {
                return;
            }
            const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
            Object.defineProperty(this.prototype, name, {
                // tslint:disable-next-line:no-any no symbol in index
                get() {
                    // tslint:disable-next-line:no-any no symbol in index
                    return this[key];
                },
                set(value) {
                    // tslint:disable-next-line:no-any no symbol in index
                    const oldValue = this[name];
                    // tslint:disable-next-line:no-any no symbol in index
                    this[key] = value;
                    this.requestUpdate(name, oldValue);
                },
                configurable: true,
                enumerable: true
            });
        }
        /**
         * Creates property accessors for registered properties and ensures
         * any superclasses are also finalized.
         * @nocollapse
         */
        static finalize() {
            if (this.hasOwnProperty(JSCompiler_renameProperty('finalized', this)) &&
                this.finalized) {
                return;
            }
            // finalize any superclasses
            const superCtor = Object.getPrototypeOf(this);
            if (typeof superCtor.finalize === 'function') {
                superCtor.finalize();
            }
            this.finalized = true;
            this._ensureClassProperties();
            // initialize Map populated in observedAttributes
            this._attributeToPropertyMap = new Map();
            // make any properties
            // Note, only process "own" properties since this element will inherit
            // any properties defined on the superClass, and finalization ensures
            // the entire prototype chain is finalized.
            if (this.hasOwnProperty(JSCompiler_renameProperty('properties', this))) {
                const props = this.properties;
                // support symbols in properties (IE11 does not support this)
                const propKeys = [
                    ...Object.getOwnPropertyNames(props),
                    ...(typeof Object.getOwnPropertySymbols === 'function') ?
                        Object.getOwnPropertySymbols(props) :
                        []
                ];
                // This for/of is ok because propKeys is an array
                for (const p of propKeys) {
                    // note, use of `any` is due to TypeSript lack of support for symbol in
                    // index types
                    // tslint:disable-next-line:no-any no symbol in index
                    this.createProperty(p, props[p]);
                }
            }
        }
        /**
         * Returns the property name for the given attribute `name`.
         * @nocollapse
         */
        static _attributeNameForProperty(name, options) {
            const attribute = options.attribute;
            return attribute === false ?
                undefined :
                (typeof attribute === 'string' ?
                    attribute :
                    (typeof name === 'string' ? name.toLowerCase() : undefined));
        }
        /**
         * Returns true if a property should request an update.
         * Called when a property value is set and uses the `hasChanged`
         * option for the property if present or a strict identity check.
         * @nocollapse
         */
        static _valueHasChanged(value, old, hasChanged = notEqual) {
            return hasChanged(value, old);
        }
        /**
         * Returns the property value for the given attribute value.
         * Called via the `attributeChangedCallback` and uses the property's
         * `converter` or `converter.fromAttribute` property option.
         * @nocollapse
         */
        static _propertyValueFromAttribute(value, options) {
            const type = options.type;
            const converter = options.converter || defaultConverter;
            const fromAttribute = (typeof converter === 'function' ? converter : converter.fromAttribute);
            return fromAttribute ? fromAttribute(value, type) : value;
        }
        /**
         * Returns the attribute value for the given property value. If this
         * returns undefined, the property will *not* be reflected to an attribute.
         * If this returns null, the attribute will be removed, otherwise the
         * attribute will be set to the value.
         * This uses the property's `reflect` and `type.toAttribute` property options.
         * @nocollapse
         */
        static _propertyValueToAttribute(value, options) {
            if (options.reflect === undefined) {
                return;
            }
            const type = options.type;
            const converter = options.converter;
            const toAttribute = converter && converter.toAttribute ||
                defaultConverter.toAttribute;
            return toAttribute(value, type);
        }
        /**
         * Performs element initialization. By default captures any pre-set values for
         * registered properties.
         */
        initialize() {
            this._saveInstanceProperties();
        }
        /**
         * Fixes any properties set on the instance before upgrade time.
         * Otherwise these would shadow the accessor and break these properties.
         * The properties are stored in a Map which is played back after the
         * constructor runs. Note, on very old versions of Safari (<=9) or Chrome
         * (<=41), properties created for native platform properties like (`id` or
         * `name`) may not have default values set in the element constructor. On
         * these browsers native properties appear on instances and therefore their
         * default value will overwrite any element default (e.g. if the element sets
         * this.id = 'id' in the constructor, the 'id' will become '' since this is
         * the native platform default).
         */
        _saveInstanceProperties() {
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            this.constructor
                ._classProperties.forEach((_v, p) => {
                if (this.hasOwnProperty(p)) {
                    const value = this[p];
                    delete this[p];
                    if (!this._instanceProperties) {
                        this._instanceProperties = new Map();
                    }
                    this._instanceProperties.set(p, value);
                }
            });
        }
        /**
         * Applies previously saved instance properties.
         */
        _applyInstanceProperties() {
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            // tslint:disable-next-line:no-any
            this._instanceProperties.forEach((v, p) => this[p] = v);
            this._instanceProperties = undefined;
        }
        connectedCallback() {
            this._updateState = this._updateState | STATE_HAS_CONNECTED;
            // Ensure connection triggers an update. Updates cannot complete before
            // connection and if one is pending connection the `_hasConnectionResolver`
            // will exist. If so, resolve it to complete the update, otherwise
            // requestUpdate.
            if (this._hasConnectedResolver) {
                this._hasConnectedResolver();
                this._hasConnectedResolver = undefined;
            }
            else {
                this.requestUpdate();
            }
        }
        /**
         * Allows for `super.disconnectedCallback()` in extensions while
         * reserving the possibility of making non-breaking feature additions
         * when disconnecting at some point in the future.
         */
        disconnectedCallback() {
        }
        /**
         * Synchronizes property values when attributes change.
         */
        attributeChangedCallback(name, old, value) {
            if (old !== value) {
                this._attributeToProperty(name, value);
            }
        }
        _propertyToAttribute(name, value, options = defaultPropertyDeclaration) {
            const ctor = this.constructor;
            const attr = ctor._attributeNameForProperty(name, options);
            if (attr !== undefined) {
                const attrValue = ctor._propertyValueToAttribute(value, options);
                // an undefined value does not change the attribute.
                if (attrValue === undefined) {
                    return;
                }
                // Track if the property is being reflected to avoid
                // setting the property again via `attributeChangedCallback`. Note:
                // 1. this takes advantage of the fact that the callback is synchronous.
                // 2. will behave incorrectly if multiple attributes are in the reaction
                // stack at time of calling. However, since we process attributes
                // in `update` this should not be possible (or an extreme corner case
                // that we'd like to discover).
                // mark state reflecting
                this._updateState = this._updateState | STATE_IS_REFLECTING_TO_ATTRIBUTE;
                if (attrValue == null) {
                    this.removeAttribute(attr);
                }
                else {
                    this.setAttribute(attr, attrValue);
                }
                // mark state not reflecting
                this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_ATTRIBUTE;
            }
        }
        _attributeToProperty(name, value) {
            // Use tracking info to avoid deserializing attribute value if it was
            // just set from a property setter.
            if (this._updateState & STATE_IS_REFLECTING_TO_ATTRIBUTE) {
                return;
            }
            const ctor = this.constructor;
            const propName = ctor._attributeToPropertyMap.get(name);
            if (propName !== undefined) {
                const options = ctor._classProperties.get(propName) || defaultPropertyDeclaration;
                // mark state reflecting
                this._updateState = this._updateState | STATE_IS_REFLECTING_TO_PROPERTY;
                this[propName] =
                    // tslint:disable-next-line:no-any
                    ctor._propertyValueFromAttribute(value, options);
                // mark state not reflecting
                this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_PROPERTY;
            }
        }
        /**
         * Requests an update which is processed asynchronously. This should
         * be called when an element should update based on some state not triggered
         * by setting a property. In this case, pass no arguments. It should also be
         * called when manually implementing a property setter. In this case, pass the
         * property `name` and `oldValue` to ensure that any configured property
         * options are honored. Returns the `updateComplete` Promise which is resolved
         * when the update completes.
         *
         * @param name {PropertyKey} (optional) name of requesting property
         * @param oldValue {any} (optional) old value of requesting property
         * @returns {Promise} A Promise that is resolved when the update completes.
         */
        requestUpdate(name, oldValue) {
            let shouldRequestUpdate = true;
            // if we have a property key, perform property update steps.
            if (name !== undefined && !this._changedProperties.has(name)) {
                const ctor = this.constructor;
                const options = ctor._classProperties.get(name) || defaultPropertyDeclaration;
                if (ctor._valueHasChanged(this[name], oldValue, options.hasChanged)) {
                    // track old value when changing.
                    this._changedProperties.set(name, oldValue);
                    // add to reflecting properties set
                    if (options.reflect === true &&
                        !(this._updateState & STATE_IS_REFLECTING_TO_PROPERTY)) {
                        if (this._reflectingProperties === undefined) {
                            this._reflectingProperties = new Map();
                        }
                        this._reflectingProperties.set(name, options);
                    }
                    // abort the request if the property should not be considered changed.
                }
                else {
                    shouldRequestUpdate = false;
                }
            }
            if (!this._hasRequestedUpdate && shouldRequestUpdate) {
                this._enqueueUpdate();
            }
            return this.updateComplete;
        }
        /**
         * Sets up the element to asynchronously update.
         */
        async _enqueueUpdate() {
            // Mark state updating...
            this._updateState = this._updateState | STATE_UPDATE_REQUESTED;
            let resolve;
            const previousUpdatePromise = this._updatePromise;
            this._updatePromise = new Promise((res) => resolve = res);
            // Ensure any previous update has resolved before updating.
            // This `await` also ensures that property changes are batched.
            await previousUpdatePromise;
            // Make sure the element has connected before updating.
            if (!this._hasConnected) {
                await new Promise((res) => this._hasConnectedResolver = res);
            }
            // Allow `performUpdate` to be asynchronous to enable scheduling of updates.
            const result = this.performUpdate();
            // Note, this is to avoid delaying an additional microtask unless we need
            // to.
            if (result != null &&
                typeof result.then === 'function') {
                await result;
            }
            resolve(!this._hasRequestedUpdate);
        }
        get _hasConnected() {
            return (this._updateState & STATE_HAS_CONNECTED);
        }
        get _hasRequestedUpdate() {
            return (this._updateState & STATE_UPDATE_REQUESTED);
        }
        get hasUpdated() {
            return (this._updateState & STATE_HAS_UPDATED);
        }
        /**
         * Performs an element update.
         *
         * You can override this method to change the timing of updates. For instance,
         * to schedule updates to occur just before the next frame:
         *
         * ```
         * protected async performUpdate(): Promise<unknown> {
         *   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
         *   super.performUpdate();
         * }
         * ```
         */
        performUpdate() {
            // Mixin instance properties once, if they exist.
            if (this._instanceProperties) {
                this._applyInstanceProperties();
            }
            if (this.shouldUpdate(this._changedProperties)) {
                const changedProperties = this._changedProperties;
                this.update(changedProperties);
                this._markUpdated();
                if (!(this._updateState & STATE_HAS_UPDATED)) {
                    this._updateState = this._updateState | STATE_HAS_UPDATED;
                    this.firstUpdated(changedProperties);
                }
                this.updated(changedProperties);
            }
            else {
                this._markUpdated();
            }
        }
        _markUpdated() {
            this._changedProperties = new Map();
            this._updateState = this._updateState & ~STATE_UPDATE_REQUESTED;
        }
        /**
         * Returns a Promise that resolves when the element has completed updating.
         * The Promise value is a boolean that is `true` if the element completed the
         * update without triggering another update. The Promise result is `false` if
         * a property was set inside `updated()`. This getter can be implemented to
         * await additional state. For example, it is sometimes useful to await a
         * rendered element before fulfilling this Promise. To do this, first await
         * `super.updateComplete` then any subsequent state.
         *
         * @returns {Promise} The Promise returns a boolean that indicates if the
         * update resolved without triggering another update.
         */
        get updateComplete() {
            return this._updatePromise;
        }
        /**
         * Controls whether or not `update` should be called when the element requests
         * an update. By default, this method always returns `true`, but this can be
         * customized to control when to update.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        shouldUpdate(_changedProperties) {
            return true;
        }
        /**
         * Updates the element. This method reflects property values to attributes.
         * It can be overridden to render and keep updated element DOM.
         * Setting properties inside this method will *not* trigger
         * another update.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        update(_changedProperties) {
            if (this._reflectingProperties !== undefined &&
                this._reflectingProperties.size > 0) {
                // Use forEach so this works even if for/of loops are compiled to for
                // loops expecting arrays
                this._reflectingProperties.forEach((v, k) => this._propertyToAttribute(k, this[k], v));
                this._reflectingProperties = undefined;
            }
        }
        /**
         * Invoked whenever the element is updated. Implement to perform
         * post-updating tasks via DOM APIs, for example, focusing an element.
         *
         * Setting properties inside this method will trigger the element to update
         * again after this update cycle completes.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        updated(_changedProperties) {
        }
        /**
         * Invoked when the element is first updated. Implement to perform one time
         * work on the element after update.
         *
         * Setting properties inside this method will trigger the element to update
         * again after this update cycle completes.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        firstUpdated(_changedProperties) {
        }
    }
    /**
     * Marks class as having finished creating properties.
     */
    UpdatingElement.finalized = true;

    /**
    @license
    Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
    This code may only be used under the BSD style license found at
    http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
    http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
    found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
    part of the polymer project is also subject to an additional IP rights grant
    found at http://polymer.github.io/PATENTS.txt
    */
    const supportsAdoptingStyleSheets = ('adoptedStyleSheets' in Document.prototype) &&
        ('replace' in CSSStyleSheet.prototype);
    const constructionToken = Symbol();
    class CSSResult {
        constructor(cssText, safeToken) {
            if (safeToken !== constructionToken) {
                throw new Error('CSSResult is not constructable. Use `unsafeCSS` or `css` instead.');
            }
            this.cssText = cssText;
        }
        // Note, this is a getter so that it's lazy. In practice, this means
        // stylesheets are not created until the first element instance is made.
        get styleSheet() {
            if (this._styleSheet === undefined) {
                // Note, if `adoptedStyleSheets` is supported then we assume CSSStyleSheet
                // is constructable.
                if (supportsAdoptingStyleSheets) {
                    this._styleSheet = new CSSStyleSheet();
                    this._styleSheet.replaceSync(this.cssText);
                }
                else {
                    this._styleSheet = null;
                }
            }
            return this._styleSheet;
        }
        toString() {
            return this.cssText;
        }
    }
    const textFromCSSResult = (value) => {
        if (value instanceof CSSResult) {
            return value.cssText;
        }
        else {
            throw new Error(`Value passed to 'css' function must be a 'css' function result: ${value}. Use 'unsafeCSS' to pass non-literal values, but
            take care to ensure page security.`);
        }
    };
    /**
     * Template tag which which can be used with LitElement's `style` property to
     * set element styles. For security reasons, only literal string values may be
     * used. To incorporate non-literal values `unsafeCSS` may be used inside a
     * template string part.
     */
    const css = (strings, ...values) => {
        const cssText = values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
        return new CSSResult(cssText, constructionToken);
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IMPORTANT: do not change the property name or the assignment expression.
    // This line will be used in regexes to search for LitElement usage.
    // TODO(justinfagnani): inject version number at build time
    (window['litElementVersions'] || (window['litElementVersions'] = []))
        .push('2.0.1');
    /**
     * Minimal implementation of Array.prototype.flat
     * @param arr the array to flatten
     * @param result the accumlated result
     */
    function arrayFlat(styles, result = []) {
        for (let i = 0, length = styles.length; i < length; i++) {
            const value = styles[i];
            if (Array.isArray(value)) {
                arrayFlat(value, result);
            }
            else {
                result.push(value);
            }
        }
        return result;
    }
    /** Deeply flattens styles array. Uses native flat if available. */
    const flattenStyles = (styles) => styles.flat ? styles.flat(Infinity) : arrayFlat(styles);
    class LitElement extends UpdatingElement {
        /** @nocollapse */
        static finalize() {
            super.finalize();
            // Prepare styling that is stamped at first render time. Styling
            // is built from user provided `styles` or is inherited from the superclass.
            this._styles =
                this.hasOwnProperty(JSCompiler_renameProperty('styles', this)) ?
                    this._getUniqueStyles() :
                    this._styles || [];
        }
        /** @nocollapse */
        static _getUniqueStyles() {
            // Take care not to call `this.styles` multiple times since this generates
            // new CSSResults each time.
            // TODO(sorvell): Since we do not cache CSSResults by input, any
            // shared styles will generate new stylesheet objects, which is wasteful.
            // This should be addressed when a browser ships constructable
            // stylesheets.
            const userStyles = this.styles;
            const styles = [];
            if (Array.isArray(userStyles)) {
                const flatStyles = flattenStyles(userStyles);
                // As a performance optimization to avoid duplicated styling that can
                // occur especially when composing via subclassing, de-duplicate styles
                // preserving the last item in the list. The last item is kept to
                // try to preserve cascade order with the assumption that it's most
                // important that last added styles override previous styles.
                const styleSet = flatStyles.reduceRight((set, s) => {
                    set.add(s);
                    // on IE set.add does not return the set.
                    return set;
                }, new Set());
                // Array.from does not work on Set in IE
                styleSet.forEach((v) => styles.unshift(v));
            }
            else if (userStyles) {
                styles.push(userStyles);
            }
            return styles;
        }
        /**
         * Performs element initialization. By default this calls `createRenderRoot`
         * to create the element `renderRoot` node and captures any pre-set values for
         * registered properties.
         */
        initialize() {
            super.initialize();
            this.renderRoot = this.createRenderRoot();
            // Note, if renderRoot is not a shadowRoot, styles would/could apply to the
            // element's getRootNode(). While this could be done, we're choosing not to
            // support this now since it would require different logic around de-duping.
            if (window.ShadowRoot && this.renderRoot instanceof window.ShadowRoot) {
                this.adoptStyles();
            }
        }
        /**
         * Returns the node into which the element should render and by default
         * creates and returns an open shadowRoot. Implement to customize where the
         * element's DOM is rendered. For example, to render into the element's
         * childNodes, return `this`.
         * @returns {Element|DocumentFragment} Returns a node into which to render.
         */
        createRenderRoot() {
            return this.attachShadow({ mode: 'open' });
        }
        /**
         * Applies styling to the element shadowRoot using the `static get styles`
         * property. Styling will apply using `shadowRoot.adoptedStyleSheets` where
         * available and will fallback otherwise. When Shadow DOM is polyfilled,
         * ShadyCSS scopes styles and adds them to the document. When Shadow DOM
         * is available but `adoptedStyleSheets` is not, styles are appended to the
         * end of the `shadowRoot` to [mimic spec
         * behavior](https://wicg.github.io/construct-stylesheets/#using-constructed-stylesheets).
         */
        adoptStyles() {
            const styles = this.constructor._styles;
            if (styles.length === 0) {
                return;
            }
            // There are three separate cases here based on Shadow DOM support.
            // (1) shadowRoot polyfilled: use ShadyCSS
            // (2) shadowRoot.adoptedStyleSheets available: use it.
            // (3) shadowRoot.adoptedStyleSheets polyfilled: append styles after
            // rendering
            if (window.ShadyCSS !== undefined && !window.ShadyCSS.nativeShadow) {
                window.ShadyCSS.ScopingShim.prepareAdoptedCssText(styles.map((s) => s.cssText), this.localName);
            }
            else if (supportsAdoptingStyleSheets) {
                this.renderRoot.adoptedStyleSheets =
                    styles.map((s) => s.styleSheet);
            }
            else {
                // This must be done after rendering so the actual style insertion is done
                // in `update`.
                this._needsShimAdoptedStyleSheets = true;
            }
        }
        connectedCallback() {
            super.connectedCallback();
            // Note, first update/render handles styleElement so we only call this if
            // connected after first update.
            if (this.hasUpdated && window.ShadyCSS !== undefined) {
                window.ShadyCSS.styleElement(this);
            }
        }
        /**
         * Updates the element. This method reflects property values to attributes
         * and calls `render` to render DOM via lit-html. Setting properties inside
         * this method will *not* trigger another update.
         * * @param _changedProperties Map of changed properties with old values
         */
        update(changedProperties) {
            super.update(changedProperties);
            const templateResult = this.render();
            if (templateResult instanceof TemplateResult) {
                this.constructor
                    .render(templateResult, this.renderRoot, { scopeName: this.localName, eventContext: this });
            }
            // When native Shadow DOM is used but adoptedStyles are not supported,
            // insert styling after rendering to ensure adoptedStyles have highest
            // priority.
            if (this._needsShimAdoptedStyleSheets) {
                this._needsShimAdoptedStyleSheets = false;
                this.constructor._styles.forEach((s) => {
                    const style = document.createElement('style');
                    style.textContent = s.cssText;
                    this.renderRoot.appendChild(style);
                });
            }
        }
        /**
         * Invoked on each update to perform rendering tasks. This method must return
         * a lit-html TemplateResult. Setting properties inside this method will *not*
         * trigger the element to update.
         */
        render() {
        }
    }
    /**
     * Ensure this class is marked as `finalized` as an optimization ensuring
     * it will not needlessly try to `finalize`.
     */
    LitElement.finalized = true;
    /**
     * Render method used to render the lit-html TemplateResult to the element's
     * DOM.
     * @param {TemplateResult} Template to render.
     * @param {Element|DocumentFragment} Node into which to render.
     * @param {String} Element name.
     * @nocollapse
     */
    LitElement.render = render$1;

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // On IE11, classList.toggle doesn't accept a second argument.
    // Since this is so minor, we just polyfill it.
    if (window.navigator.userAgent.match('Trident')) {
        DOMTokenList.prototype.toggle = function (token, force) {
            if (force === undefined || force) {
                this.add(token);
            }
            else {
                this.remove(token);
            }
            return force === undefined ? true : force;
        };
    }
    /**
     * Stores the ClassInfo object applied to a given AttributePart.
     * Used to unset existing values when a new ClassInfo object is applied.
     */
    const classMapCache = new WeakMap();
    /**
     * Stores AttributeParts that have had static classes applied (e.g. `foo` in
     * class="foo ${classMap()}"). Static classes are applied only the first time
     * the directive is run on a part.
     */
    // Note, could be a WeakSet, but prefer not requiring this polyfill.
    const classMapStatics = new WeakMap();
    /**
     * A directive that applies CSS classes. This must be used in the `class`
     * attribute and must be the only part used in the attribute. It takes each
     * property in the `classInfo` argument and adds the property name to the
     * element's `classList` if the property value is truthy; if the property value
     * is falsey, the property name is removed from the element's `classList`. For
     * example
     * `{foo: bar}` applies the class `foo` if the value of `bar` is truthy.
     * @param classInfo {ClassInfo}
     */
    const classMap = directive((classInfo) => (part) => {
        if (!(part instanceof AttributePart) || (part instanceof PropertyPart) ||
            part.committer.name !== 'class' || part.committer.parts.length > 1) {
            throw new Error('The `classMap` directive must be used in the `class` attribute ' +
                'and must be the only part in the attribute.');
        }
        // handle static classes
        if (!classMapStatics.has(part)) {
            part.committer.element.className = part.committer.strings.join(' ');
            classMapStatics.set(part, true);
        }
        // remove old classes that no longer apply
        const oldInfo = classMapCache.get(part);
        for (const name in oldInfo) {
            if (!(name in classInfo)) {
                part.committer.element.classList.remove(name);
            }
        }
        // add new classes
        for (const name in classInfo) {
            if (!oldInfo || (oldInfo[name] !== classInfo[name])) {
                // We explicitly want a loose truthy check here because
                // it seems more convenient that '' and 0 are skipped.
                part.committer.element.classList.toggle(name, Boolean(classInfo[name]));
            }
        }
        classMapCache.set(part, classInfo);
    });

    const DAT_KEY_REGEX = /[0-9a-f]{64}/i;
    const KNOWN_DRIVE_TYPES = {
      'unwalled.garden/person': 'user',
      'unwalled.garden/module': 'module',
      'unwalled.garden/template': 'template',
      'webterm.sh/cmd-pkg': 'webterm command'
    };

    function ucfirst (str) {
      if (!str) str = '';
      if (typeof str !== 'string') str = '' + str;
      return str.charAt(0).toUpperCase() + str.slice(1)
    }

    function pluralize (num, base, suffix = 's') {
      if (num === 1) { return base }
      return base + suffix
    }

    function joinPath (...args) {
      var str = args[0];
      for (let v of args.slice(1)) {
        v = v && typeof v === 'string' ? v : '';
        let left = str.endsWith('/');
        let right = v.startsWith('/');
        if (left !== right) str += v;
        else if (left) str += v.slice(1);
        else str += '/' + v;
      }
      return str
    }

    function toDomain (str) {
      if (!str) return ''
      try {
        var urlParsed = new URL(str);
        return urlParsed.hostname
      } catch (e) {
        // ignore, not a url
      }
      return str
    }

    function toNiceDomain (str, len=4) {
      var domain = toDomain(str);
      if (DAT_KEY_REGEX.test(domain)) {
        domain = `${domain.slice(0, len)}..${domain.slice(-2)}`;
      }
      return domain
    }

    function toNiceUrl (str) {
      if (!str) return ''
      try {
        var urlParsed = new URL(str);
        if (DAT_KEY_REGEX.test(urlParsed.hostname)) {
          urlParsed.hostname = `${urlParsed.hostname.slice(0, 4)}..${urlParsed.hostname.slice(-2)}`;
        }
        return urlParsed.toString()
      } catch (e) {
        // ignore, not a url
      }
      return str
    }

    function normalizeUrl (str = '') {
      try {
        let url = new URL(str);
        let res = url.protocol + '//' + url.hostname;
        if (url.port) res += ':' + url.port;
        res += url.pathname.replace(/(\/)$/, '') || '/';
        if (url.search && url.search !== '?') res += url.search;
        if (url.hash && url.hash !== '#') res += url.hash;
        return res
      } catch (e) {
        return str
      }
    }

    const reservedChars = /[ <>:"/\\|?*\x00-\x1F]/g;
    const endingDashes = /([-]+$)/g;
    function slugify (str = '') {
      return str.replace(reservedChars, '-').replace(endingDashes, '')
    }

    function toNiceTopic (t) {
      return t.replace(/_/g, ' ')
    }

    function normalizeTopic (t) {
      return t.replace(/\s/g, '_')
    }

    function isValidTopic (t) {
      return /[a-z0-9_\s]+/.test(t)
    }

    function toNiceDriveType (dt) {
      if (!dt) return ''
      return KNOWN_DRIVE_TYPES[dt] || dt
    }

    const BIN_EXTS = [
      '3dm',
      '3ds',
      '3g2',
      '3gp',
      '7z',
      'a',
      'aac',
      'adp',
      'ai',
      'aif',
      'aiff',
      'alz',
      'ape',
      'apk',
      'ar',
      'arj',
      'asf',
      'au',
      'avi',
      'bak',
      'baml',
      'bh',
      'bin',
      'bk',
      'bmp',
      'btif',
      'bz2',
      'bzip2',
      'cab',
      'caf',
      'cgm',
      'class',
      'cmx',
      'cpio',
      'cr2',
      'cur',
      'dat',
      'dcm',
      'deb',
      'dex',
      'djvu',
      'dll',
      'dmg',
      'dng',
      'doc',
      'docm',
      'docx',
      'dot',
      'dotm',
      'dra',
      'DS_Store',
      'dsk',
      'dts',
      'dtshd',
      'dvb',
      'dwg',
      'dxf',
      'ecelp4800',
      'ecelp7470',
      'ecelp9600',
      'egg',
      'eol',
      'eot',
      'epub',
      'exe',
      'f4v',
      'fbs',
      'fh',
      'fla',
      'flac',
      'fli',
      'flv',
      'fpx',
      'fst',
      'fvt',
      'g3',
      'gh',
      'gif',
      'graffle',
      'gz',
      'gzip',
      'h261',
      'h263',
      'h264',
      'icns',
      'ico',
      'ief',
      'img',
      'ipa',
      'iso',
      'jar',
      'jpeg',
      'jpg',
      'jpgv',
      'jpm',
      'jxr',
      'key',
      'ktx',
      'lha',
      'lib',
      'lvp',
      'lz',
      'lzh',
      'lzma',
      'lzo',
      'm3u',
      'm4a',
      'm4v',
      'mar',
      'mdi',
      'mht',
      'mid',
      'midi',
      'mj2',
      'mka',
      'mkv',
      'mmr',
      'mng',
      'mobi',
      'mov',
      'movie',
      'mp3',
      'mp4',
      'mp4a',
      'mpeg',
      'mpg',
      'mpga',
      'mxu',
      'nef',
      'npx',
      'numbers',
      'nupkg',
      'o',
      'oga',
      'ogg',
      'ogv',
      'otf',
      'pages',
      'pbm',
      'pcx',
      'pdb',
      'pdf',
      'pea',
      'pgm',
      'pic',
      'png',
      'pnm',
      'pot',
      'potm',
      'potx',
      'ppa',
      'ppam',
      'ppm',
      'pps',
      'ppsm',
      'ppsx',
      'ppt',
      'pptm',
      'pptx',
      'psd',
      'pya',
      'pyc',
      'pyo',
      'pyv',
      'qt',
      'rar',
      'ras',
      'raw',
      'resources',
      'rgb',
      'rip',
      'rlc',
      'rmf',
      'rmvb',
      'rtf',
      'rz',
      's3m',
      's7z',
      'scpt',
      'sgi',
      'shar',
      'sil',
      'sketch',
      'slk',
      'smv',
      'snk',
      'so',
      'stl',
      'suo',
      'sub',
      'swf',
      'tar',
      'tbz',
      'tbz2',
      'tga',
      'tgz',
      'thmx',
      'tif',
      'tiff',
      'tlz',
      'ttc',
      'ttf',
      'txz',
      'udf',
      'uvh',
      'uvi',
      'uvm',
      'uvp',
      'uvs',
      'uvu',
      'viv',
      'vob',
      'war',
      'wav',
      'wax',
      'wbmp',
      'wdp',
      'weba',
      'webm',
      'webp',
      'whl',
      'wim',
      'wm',
      'wma',
      'wmv',
      'wmx',
      'woff',
      'woff2',
      'wrm',
      'wvx',
      'xbm',
      'xif',
      'xla',
      'xlam',
      'xls',
      'xlsb',
      'xlsm',
      'xlsx',
      'xlt',
      'xltm',
      'xltx',
      'xm',
      'xmind',
      'xpi',
      'xpm',
      'xwd',
      'xz',
      'z',
      'zip',
      'zipx'
    ];

    function isFilenameBinary (str = '') {
      return BIN_EXTS.includes(str.split('.').pop().toLowerCase())
    }

    /**
     * Helper to make node-style CBs into promises
     * @example
     * cbPromise(cb => myNodeStyleMethod(cb)).then(...)
     * @param {function(Function): any} method
     * @returns {Promise<any>}
     */

    /**
     * Helper to run an async operation against an array in chunks
     * @example
     * var res = await chunkAsync(values, 3, v => fetchAsync(v)) // chunks of 3s
     * @param {any[]} arr 
     * @param {Number} chunkSize 
     * @param {(value: any, index: number, array: any[]) => Promise<any>} cb 
     * @returns {Promise<any[]>}
     */
    async function chunkMapAsync (arr, chunkSize, cb) {
      const resultChunks = [];
      for (let chunk of chunkArray(arr, chunkSize)) {
        resultChunks.push(await Promise.all(chunk.map(cb)));
      }
      return resultChunks.flat()

    }

    /**
     * Helper to split an array into chunks
     * @param {any[]} arr 
     * @param {Number} chunkSize 
     * @returns {Array<any[]>}
     */
    function chunkArray (arr, chunkSize) {
      const result = [];
      for (let i = 0; i < arr.length; i += chunkSize) {
        result.push(arr.slice(i, i + chunkSize));
      }
      return result
    }

    // typedefs
    // =

    /**
     * @typedef {Object} FSQueryOpts
     * @prop {string|string[]} path
     * @prop {string} [type]
     * @prop {string} [mount]
     * @prop {Object} [metadata]
     * @prop {string} [sort] - 'name', 'ctime', 'mtime'
     * @prop {boolean} [reverse]
     * @prop {number} [limit]
     * @prop {number} [offset]
     *
     * @typedef {Object} Stat
     * @prop {number} mode
     * @prop {number} size
     * @prop {number} offset
     * @prop {number} blocks
     * @prop {Date} atime
     * @prop {Date} mtime
     * @prop {Date} ctime
     * @prop {Object} metadata
     * @prop {Object} [mount]
     * @prop {string} [mount.key]
     * @prop {string} linkname
     *
     * @typedef {Object} FSQueryResult
     * @prop {string} type
     * @prop {string} path
     * @prop {string} url
     * @prop {Stat} stat
     * @prop {string} drive
     * @prop {string} [mount]
     * @prop {any} [content]
     */

    // exported
    // =

    /**
     * @param {FSQueryOpts} query
     * @param {Hyperdrive} [drive]
     * @returns {Promise<FSQueryResult[]>}
     */
    async function queryRead (query, drive = navigator.filesystem) {
      var files = await drive.query(query);
      await chunkMapAsync(files, 10, async (file) => {
        if (isFilenameBinary(file.path)) return
        file.content = await drive.readFile(file.path, 'utf8').catch(err => undefined);
        if (file.path.endsWith('.json')) {
          try {
            file.content = JSON.parse(file.content);
          } catch (e) {
            // ignore
          }
        }
      });
      return files
    }

    /**
     * @param {string} path
     * @param {Object} [drive]
     */
    async function ensureDir (path, drive = navigator.filesystem) {
      try {
        let st = await drive.stat(path).catch(e => null);
        if (!st) {
          await drive.mkdir(path);
        } else if (!st.isDirectory()) {
          console.error('Warning! Filesystem expects a folder but an unexpected file exists at this location.', {path});
        }
      } catch (e) {
        console.error('Filesystem failed to make directory', {path, error: e});
      }
    }

    /**
     * @param {string} path
     * @param {Object} [drive]
     * @param {number} [depth=1]
     */
    async function ensureParentDir (path, drive = navigator.filesystem, depth = 1) {
      return ensureDir(path.split('/').slice(0, -1 * depth).join('/'), drive)
    }

    /**
     * @param {string} path 
     * @param {string} url 
     * @param {Object} [drive]
     * @return {Promise<void>}
     */
    async function ensureMount (path, url, drive = navigator.filesystem) {
      try {
        let st = await drive.stat(path).catch(e => null);
        let key = await Hyperdrive.resolveName(url);
        if (!st) {
          // add mount
          await drive.mount(path, key);
        } else if (st.mount) {
          if (st.mount.key !== key) {
            // change mount
            await drive.unmount(path);
            await drive.mount(path, key);
          }
        } else {
          console.error('Warning! Filesystem expects a mount but an unexpected file exists at this location.', {path});
        }
      } catch (e) {
        console.error('Filesystem failed to mount drive', {path, url, error: e});
      }
    }

    /**
     * @param {string} pathSelector 
     * @param {string} url
     * @param {Object} [drive]
     * @return {Promise<void>}
     */
    async function ensureUnmountByUrl (pathSelector, url, drive = navigator.filesystem) {
      try {
        let mounts = await drive.query({
          path: pathSelector,
          type: 'mount'
        });
        let mount = mounts.find(item => item.mount === url);
        if (mount) {
          // remove mount
          await drive.unmount(mount.path);
        } else {
          throw "Mount not found"
        }
      } catch (e) {
        console.error('Filesystem failed to unmount drive', {pathSelector, url, error: e});
      }
    }

    /**
     * @param {string} containingPath
     * @param {string} title
     * @param {Object} [drive]
     * @returns {Promise<string>}
     */
    async function getAvailableName (containingPath, title, drive = navigator.filesystem) {
      var basename = slugify((title || '').trim() || 'untitled').toLowerCase();
      for (let i = 1; i < 1e9; i++) {
        let name = (i === 1) ? basename : `${basename}-${i}`;
        let st = await drive.stat(joinPath(containingPath, name)).catch(e => null);
        if (!st) return name
      }
      // yikes if this happens
      throw new Error('Unable to find an available name for ' + title)
    }

    class AwaitLock {
      constructor() {
          this._acquired = false;
          this._waitingResolvers = [];
      }
      /**
       * Acquires the lock, waiting if necessary for it to become free if it is already locked. The
       * returned promise is fulfilled once the lock is acquired.
       *
       * After acquiring the lock, you **must** call `release` when you are done with it.
       */
      acquireAsync() {
          if (!this._acquired) {
              this._acquired = true;
              return Promise.resolve();
          }
          return new Promise(resolve => {
              this._waitingResolvers.push(resolve);
          });
      }
      /**
       * Acquires the lock if it is free and otherwise returns immediately without waiting. Returns
       * `true` if the lock was free and is now acquired, and `false` otherwise
       */
      tryAcquire() {
          if (!this._acquired) {
              this._acquired = true;
              return true;
          }
          return false;
      }
      /**
       * Releases the lock and gives it to the next waiting acquirer, if there is one. Each acquirer
       * must release the lock exactly once.
       */
      release() {
          if (this._waitingResolvers.length > 0) {
              let resolve = this._waitingResolvers.shift();
              resolve();
          }
          else {
              this._acquired = false;
          }
      }
    }

    var locks = {};
    async function lock (key) {
      if (!(key in locks)) locks[key] = new AwaitLock();

      var lock = locks[key];
      await lock.acquireAsync();
      return lock.release.bind(lock)
    }

    const DEFAULT_TOPICS = [
      'news',
      'code',
      'i_made_this',
      'gifs',
      'aww'
    ];

    // typedefs
    // =

    /**
     * @typedef {import('./fs.js').FSQueryResult} FSQueryResult
     * @typedef {import('./fs.js').DriveInfo} DriveInfo
     * 
     * @typedef {DriveInfo} SocialProfile
     * @prop {boolean} isUser
     * @prop {boolean} isUserFollowing
     * @prop {boolean} isFollowingUser
     * @prop {DriveInfo[]} followers
     * @prop {DriveInfo[]} following
     * 
     * @typedef {FSQueryResult} Post
     * @prop {string} topic
     *
     * @typedef {FSQueryResult} Comment
     * @prop {string} content
     *
     * @typedef {Comment} ThreadedComment
     * @prop {ThreadedComment} parent
     * @prop {ThreadedComment[]} [replies]
     * @prop {number} replyCount
     * 
     * @typedef {Object} TabulatedVotes
     * @prop {DriveInfo[]} upvotes
     * @prop {DriveInfo[]} downvotes
     */

    // exported
    // =

    var user = undefined;
    var profileCache = {};
    const profiles = {
      setUser (u) {
        user = u;
      },

      /**
       * @param {string} key 
       * @returns {Promise<SocialProfile>}
       */
      async get (key) {
        var match = DAT_KEY_REGEX.exec(key);
        if (match) key = match[0];
        else key = await Hyperdrive.resolveName(key);

        // check cache
        if (profileCache[key]) {
          return await profileCache[key]
        }

        profileCache[key] = (async function () {
          var drive = new Hyperdrive(key);
          var profile = await drive.getInfo();
          profile.isUser = profile.url === user.url;
          profile.followers = undefined;
          profile.following = undefined;
          profile.isFollowingUser = undefined;
          profile.isUserFollowing = undefined;
          return profile
        })();

        return await profileCache[key]
      },

      async readSocialGraph (prof, user, {includeProfiles} = {includeProfiles: false}) {
        // lock this read to be sequential to avoid overloading the hyperdrive stack
        let release = await lock('read-social-graph');
        try {
          if (prof.followers && prof.following) return
          var key = prof.url.slice('hd://'.length);

          var [followersQuery, followingQuery] = await Promise.all([
            follows.list({target: key}, {includeProfiles}),
            follows.list({author: key}, {includeProfiles})
          ]);

          prof.followers = followersQuery.map(item => item.drive);
          prof.following = followingQuery.map(item => item.mount);
          prof.isFollowingUser = Boolean(prof.following.find(f => f === user.url));
          prof.isUserFollowing = Boolean(prof.followers.find(f => f === user.url));
        } finally {
          release();
        }
      },

      async readProfile (item) {
        item.drive = typeof item.drive === 'string' ? await profiles.get(item.drive) : item.drive;
        item.mount = typeof item.mount === 'string' ? await profiles.get(item.mount) : item.mount;
      },

      async readAllProfiles (items) {
        await Promise.all(items.map(profiles.readProfile));
      }
    };

    const follows = {
      /**
       * @param {Object} [query]
       * @param {string} [query.author]
       * @param {string} [query.target]
       * @param {Object} [opts]
       * @param {boolean} [opts.includeProfiles]
       * @param {boolean} [opts.removeDuplicateMounts]
       * @returns {Promise<FSQueryResult[]>}
       */
      async list ({author, target} = {author: undefined, target: undefined}, {includeProfiles, removeDuplicateMounts} = {includeProfiles: false, removeDuplicateMounts: false}) {
        var drive = (author && author !== 'me') ? new Hyperdrive(author) : navigator.filesystem;
        let results = await drive.query({
          type: 'mount',
          path: getFollowsPaths(author),
          mount: target
        });
        if (removeDuplicateMounts) {
          let results2 = [];
          let set = new Set();
          for (const item of results) {
            if(!set.has(item.mount)){
              set.add(item.mount);
              results2.push(item);
            }
          }
          results = results2;
        }
        if (includeProfiles) {
          await profiles.readAllProfiles(results);
        }
        return results
      },

      /**
       * @param {Object} query
       * @param {string} query.author
       * @param {string} query.target
       * @returns {Promise<boolean>}
       */
      async exists ({author, target}) {
        var drive = (author && author !== 'me') ? new Hyperdrive(author) : navigator.filesystem;
        let results = await drive.query({
          type: 'mount',
          path: getFollowsPaths(author),
          mount: target,
          limit: 1
        });
        return !!results[0]
      },

      /**
       * @param {string} url
       * @param {string} title
       * @param {Object} [drive]
       * @returns {Promise<void>}
       */
      async add (url, title = 'anonymous', drive = undefined) {
        var path = drive ? '/follows' : '/profile/follows';
        drive = drive || navigator.filesystem;
        await ensureDir(path, drive);
        var mount = await drive.query({path: `${path}/*`, mount: url});
        if (mount[0]) return
        var name = await getAvailableName(path, title, drive);
        await ensureMount(joinPath(path, name), url, drive);
      },

      /**
       * @param {string} urlOrName
       * @param {Object} [drive]
       * @returns {Promise<void>}
       */
      async remove (urlOrName, drive = undefined) {
        var path = drive ? '/follows' : '/profile/follows';
        drive = drive || navigator.filesystem;

        var mount = await drive.query({path: `${path}/*`, mount: urlOrName});
        if (mount[0]) return drive.unmount(mount[0].path)

        try {
          await drive.stat(`${path}/${urlOrName}`);
        } catch (e) {
          return // dne
        }
        return drive.unmount(`${path}/${urlOrName}`)
      }
    };

    const posts = {
      /**
       * @param {Object} [query]
       * @param {string} [query.topic]
       * @param {string} [query.author]
       * @param {string} [query.driveType]
       * @param {string} [query.sort]
       * @param {boolean} [query.reverse]
       * @param {number} [query.offset]
       * @param {number} [query.limit]
       * @param {Object} [opts]
       * @param {boolean} [opts.includeProfiles]
       * @returns {Promise<Post[]>}
       */
      async list (
        {topic, author, driveType, sort, reverse, offset, limit} = {topic: undefined, author: undefined, driveType: undefined, sort: undefined, reverse: undefined, offset: undefined, limit: undefined},
        {includeProfiles} = {includeProfiles: false}
      ) {
        var drive = (author && author !== 'me') ? new Hyperdrive(author) : navigator.filesystem;
        var posts = await queryRead({
          path: getPostsPaths(author, topic),
          metadata: driveType ? {'drive-type': driveType} : undefined,
          sort,
          reverse, 
          offset,
          limit
        }, drive);
        posts = posts.filter(post => {
          if (!isNonemptyString(post.stat.metadata.title)) {
            return false
          }
          if (post.path.endsWith('.goto')) {
            return (
              isNonemptyString(post.stat.metadata.href)
              && isUrl(post.stat.metadata.href)
            )
          }
          if (post.path.endsWith('.md') || post.path.endsWith('.txt')) {
            return isNonemptyString(post.content)
          }
          return true
        });
        for (let post of posts) {
          let pathParts = post.path.split('/');
          post.topic = pathParts[pathParts.length - 2];
        }
        if (includeProfiles) {
          await profiles.readAllProfiles(posts);
        }
        return posts
      },

      /**
       * 
       * @param {string} author 
       * @param {string} path 
       * @returns {Promise<Post>}
       */
      async get (author, path) {
        let drive = new Hyperdrive(author);
        let url = drive.url + path;

        let pathParts = path.split('/');
        var topic = pathParts[pathParts.length - 2];

        return {
          type: 'file',
          path,
          url,
          stat: await drive.stat(path),
          drive: await profiles.get(author),
          mount: undefined,
          content: isFilenameBinary(path) ? undefined : await drive.readFile(path),
          topic
        }
      },

      /**
       * @param {Object} post
       * @param {string} post.href
       * @param {string} post.title
       * @param {string} post.topic
       * @param {string} [post.driveType]
       * @param {Object} [drive]
       * @returns {Promise<string>}
       */
      async addLink ({href, title, topic, driveType}, drive = undefined) {
        if (!isNonemptyString(href)) throw new Error('URL is required')
        if (!isUrl(href)) throw new Error('Invalid URL')
        if (!isNonemptyString(title)) throw new Error('Title is required')
        if (!isValidTopic(topic)) throw new Error('Topic is required')
        if (driveType && !isNonemptyString(driveType)) throw new Error('DriveType must be a string')

        href = normalizeUrl(href);
        topic = normalizeTopic(topic);
        var path = drive ? `/posts/${topic}/${Date.now()}.goto` : `/profile/posts/${topic}/${Date.now()}.goto`;

        drive = drive || navigator.filesystem;
        await ensureParentDir(path, drive, 2);
        await ensureParentDir(path, drive, 1);
        await drive.writeFile(path, '', {metadata: {href, title, 'drive-type': driveType}});
        return path
      },

      /**
       * @param {Object} post
       * @param {string} post.title
       * @param {string} post.topic
       * @param {string} post.content
       * @param {Object} [drive]
       * @returns {Promise<string>}
       */
      async addTextPost ({title, topic, content}, drive = undefined) {
        if (!isNonemptyString(content)) throw new Error('Content is required')
        if (!isNonemptyString(title)) throw new Error('Title is required')
        if (!isValidTopic(topic)) throw new Error('Topic is required')

        topic = normalizeTopic(topic);
        var path = drive ? `/posts/${topic}/${Date.now()}.md` : `/profile/posts/${topic}/${Date.now()}.md`;

        drive = drive || navigator.filesystem;
        await ensureParentDir(path, drive, 2);
        await ensureParentDir(path, drive, 1);
        await drive.writeFile(path, content, {metadata: {title}});
        return path
      },

      /**
       * @param {Object} post
       * @param {string} post.title
       * @param {string} post.topic
       * @param {string} post.ext
       * @param {string} post.base64buf
       * @param {Object} [drive]
       * @returns {Promise<string>}
       */
      async addFile ({title, topic, ext, base64buf}, drive = undefined) {
        if (!isNonemptyString(base64buf)) throw new Error('Base64buf is required')
        if (!isNonemptyString(ext)) throw new Error('File extension is required')
        if (!isNonemptyString(title)) throw new Error('Title is required')
        if (!isValidTopic(topic)) throw new Error('Topic is required')

        topic = normalizeTopic(topic);
        var path = drive ? `/posts/${topic}/${Date.now()}.${ext}` : `/profile/posts/${topic}/${Date.now()}.${ext}`;

        drive = drive || navigator.filesystem;
        await ensureParentDir(path, drive, 2);
        await ensureParentDir(path, drive, 1);
        await drive.writeFile(path, base64buf, {encoding: 'base64', metadata: {title}});
        return path
      },

      /**
       * @param {Post} post 
       * @param {string} newTitle 
       */
      async changeTitle (post, newTitle) {
        if (!isNonemptyString(newTitle)) throw new Error('Title is required')

        var filename = post.path.split('/').pop();
        var path = `/profile/posts/${post.topic}/${filename}`;
        var metadata = Object.assign({}, post.stat.metadata, {title: newTitle});
        await navigator.filesystem.writeFile(path, post.content || '', {metadata});
      },

      /**
       * @param {Post} post
       * @returns {Promise<void>}
       */
      async remove (post) {
        var filename = post.path.split('/').pop();
        var path = `/profile/posts/${post.topic}/${filename}`;
        await navigator.filesystem.unlink(path);
      }
    };

    const topics = {
      /**
       * @param {Object} query
       * @param {string} [query.author]
       * @returns {Promise<Array<string>>}
       */
      async list ({author} = {author: undefined}) {
        var folders = await navigator.filesystem.query({
          type: 'directory',
          path: getTopicsPaths(author)
        });

        var topics = new Set();
        for (let folder of folders) {
          let name = folder.path.split('/').pop();
          if (!isValidTopic(name)) continue
          name = normalizeTopic(name);
          topics.add(name);
        }

        for (let t of DEFAULT_TOPICS) {
          topics.add(t);
        }

        return Array.from(topics)
      }
    };

    var commentCache = {};
    const comments = {
      /**
       * @param {Object} query
       * @param {string} [query.author]
       * @param {string} [query.href]
       * @param {string} [query.sort]
       * @param {boolean} [query.reverse]
       * @param {number} [query.offset]
       * @param {number} [query.limit]
       * @returns {Promise<Comment[]>}
       */
      async list ({author, href, sort, reverse, offset, limit} = {author: undefined, href: undefined, sort: undefined, reverse: undefined, offset: undefined, limit: undefined}) {
        var drive = (author && author !== 'me') ? new Hyperdrive(author) : navigator.filesystem;
        href = href ? normalizeUrl(href) : undefined;
        var comments = await queryRead({
          path: getCommentsPaths(author),
          metadata: href ? {href} : undefined,
          sort,
          reverse,
          offset,
          limit
        }, drive);
        comments = comments.filter(c => isNonemptyString(c.content));
        await profiles.readAllProfiles(comments);
        return comments
      },

      /**
       * @param {Object} query
       * @param {string} [query.author]
       * @param {string} [query.href]
       * @param {string} [query.sort]
       * @param {boolean} [query.reverse]
       * @returns {Promise<Comment[]>}
       */
      async count ({author, href, sort, reverse} = {author: undefined, href: undefined, sort: undefined, reverse: undefined}) {
        href = href ? normalizeUrl(href) : undefined;
        // commented out in favor of the cache
        // var comments = await navigator.filesystem.query({
        //   path: getCommentsPaths(author),
        //   metadata: href ? {href} : undefined,
        //   sort,
        //   reverse
        // })
        var ckey = author || 'default';
        if (!commentCache[ckey]) {
          commentCache[ckey] = await navigator.filesystem.query({
            path: getCommentsPaths(author)
          });
        }
        var comments = commentCache[ckey];
        if (href) comments = comments.filter(comment => comment.stat.metadata.href === href);
        return comments.length
      },

      /**
       * @param {string} href
       * @param {Object} query
       * @param {string} [query.author]
       * @param {string} [query.parent]
       * @param {number} [query.depth]
       * @returns {Promise<ThreadedComment[]>}
       */
      async thread (href, {author, parent, depth} = {author: undefined, parent: undefined, depth: undefined}) {
        href = normalizeUrl(href);
        var comments = await queryRead({
          path: getCommentsPaths(author),
          metadata: href ? {href} : undefined
        });
        comments = comments.filter(c => isNonemptyString(c.content));
        await profiles.readAllProfiles(comments);

        // create a map of comments by their URL
        var commentsByUrl = {};
        comments.forEach(comment => { commentsByUrl[comment.url] = comment; });

        // attach each comment to its parent, forming a tree
        var rootComments = [];
        comments.forEach(comment => {
          if (comment.stat.metadata.parent) {
            let parent = commentsByUrl[comment.stat.metadata.parent];
            if (!parent) {
              // TODO insert a placeholder parent when not found
              // something that means "this post was by somebody you dont follow"
              // -prf
              return
            }
            if (!parent.replies) {
              parent.replies = [];
              parent.replyCount = 0;
            }
            parent.replies.push(comment);
            parent.replyCount++;
          } else {
            rootComments.push(comment);
          }
        });

        // apply the parent filter
        if (parent) {
          rootComments = [];
          comments.forEach(comment => {
            if (comment.stat.metadata.parent === parent) {
              rootComments.push(comment);
            }
          });
        }

        // apply the depth limit
        if (depth) {
          let recursiveApplyDepth = (currentDepth, comment) => {
            if (!comment.replies) return
            if (currentDepth === depth) {
              comment.replies = null;
            } else {
              comment.replies.forEach(reply => recursiveApplyDepth(currentDepth + 1, reply));
            }
          };
          rootComments.forEach(comment => recursiveApplyDepth(1, comment));
        }

        return rootComments
      },

      /**
       * 
       * @param {string} author 
       * @param {string} path 
       * @returns {Promise<Comment>}
       */
      async get (author, path) {
        let drive = new Hyperdrive(author);
        let url = drive.url + path;
        return {
          type: 'file',
          path,
          url,
          stat: await drive.stat(path),
          drive: await profiles.get(author),
          mount: undefined,
          content: await drive.readFile(path),
        }
      },

      /**
       * @param {Object} comment
       * @param {string} comment.href
       * @param {string} [comment.parent]
       * @param {string} comment.content
       * @returns {Promise<string>}
       */
      async add ({href, parent, content}, drive = undefined) {
        if (!isNonemptyString(href)) throw new Error('URL is required')
        if (!isUrl(href)) throw new Error('Invalid URL')
        if (!isNonemptyString(content)) throw new Error('Content is required')
        
        href = normalizeUrl(href);

        var path = drive ? `/comments/${Date.now()}.md` : `/profile/comments/${Date.now()}.md`;
        drive = drive || navigator.filesystem;
        await ensureParentDir(path, drive);
        await drive.writeFile(path, content, {metadata: {href, parent}});
        return path
      },

      /**
       * @param {Comment} comment
       * @param {Object} updates
       * @param {string} [updates.content]
       * @returns {Promise<string>}
       */
      async update (comment, {content}) {
        if (!isNonemptyString(content)) throw new Error('Content is required')
        var commentPath = `/profile/comments/${comment.path.split('/').pop()}`;
        
        var stat;
        try {
          stat = await navigator.filesystem.stat(commentPath);
        } catch (e) {
          throw new Error(`Failed to read comment-file for update: ${e.toString()}`)
        }

        await navigator.filesystem.writeFile(commentPath, content, {metadata: stat.metadata});
        return commentPath
      },

      /**
       * @param {Comment} comment
       * @returns {Promise<void>}
       */
      async remove (comment) {
        var commentPath = `/profile/comments/${comment.path.split('/').pop()}`;
        await navigator.filesystem.unlink(commentPath);
      }
    };

    var voteCache = {};
    const votes = {
      /**
       * @param {Object} query
       * @param {string} [query.author]
       * @param {string} [query.href]
       * @param {string} [query.sort]
       * @param {boolean} [query.reverse]
       * @returns {Promise<FSQueryResult[]>}
       */
      async list ({author, href, sort, reverse} = {author: undefined, href: undefined, sort: undefined, reverse: undefined}) {
        href = href ? normalizeUrl(href) : undefined;
        var drive = (author && author !== 'me') ? new Hyperdrive(author) : navigator.filesystem;
        var res = await drive.query({
          path: getVotesPaths(author),
          metadata: href ? {href} : undefined,
          sort,
          reverse
        });
        await profiles.readAllProfiles(res);
        return res
      },

      /**
       * @param {string} href
       * @param {Object} query
       * @param {string} [query.author]
       * @param {Object} [opts]
       * @param {boolean} [opts.includeProfiles]
       * @param {boolean} [opts.noCache]
       * @returns {Promise<TabulatedVotes>}
       */
      async tabulate (href, {author} = {author: undefined}, {includeProfiles, noCache} = {includeProfiles: false, noCache: false}) {
        href = normalizeUrl(href);
        var drive = (author && author !== 'me') ? new Hyperdrive(author) : navigator.filesystem;
        // commented out in favor of the cache
        // var votes = await drive.query({
        //   path: getVotesPaths(author),
        //   metadata: {href}
        // })
        if (!voteCache[author] || noCache) {
          voteCache[author] = await drive.query({
            path: getVotesPaths(author)
          });
        }
        var votes = voteCache[author].filter(item => item.stat.metadata.href === href);

        if (includeProfiles) {
          await profiles.readAllProfiles(votes);
        }

        // construct tabulated list
        var upvotes = new Set();
        var downvotes = new Set();
        for (let vote of votes) {
          if (Number(vote.stat.metadata.vote) === -1) {
            upvotes.delete(vote.drive);
            downvotes.add(vote.drive);
          } else {
            upvotes.add(vote.drive);
            downvotes.delete(vote.drive);
          }
        }

        return {
          upvotes: Array.from(upvotes),
          downvotes: Array.from(downvotes)
        }
      },

      /**
       * @param {string} href
       * @returns {Promise<FSQueryResult>}
       */
      async get (author, href) {
        href = normalizeUrl(href);
        var drive = (author && author !== 'me') ? new Hyperdrive(author) : navigator.filesystem;
        var votes = await drive.query({
          path: getVotesPaths(author),
          metadata: {href}
        });
        return votes[0] ? votes[0] : undefined
      },

      /**
       * @param {string} href
       * @param {number} vote
       * @returns {Promise<string>}
       */
      async put (href, vote, drive = undefined) {
        if (!isNonemptyString(href)) throw new Error('URL is required')
        if (!isUrl(href)) throw new Error('Invalid URL')

        href = normalizeUrl(href);
        vote = vote == 1 ? 1 : vote == -1 ? -1 : 0;

        var existingVote = await votes.get(drive ? drive.url : 'me', href);
        if (existingVote) await (drive || navigator.filesystem).unlink(existingVote.path);

        if (!vote) return

        var path = drive ? `/votes/${Date.now()}.goto` : `/profile/votes/${Date.now()}.goto`;
        drive = drive || navigator.filesystem;
        await ensureParentDir(path, drive);
        await drive.writeFile(path, '', {metadata: {href, vote}});
        return path
      },

      /**
       * @param {Object} votes 
       * @param {string} subjectUrl 
       */
      getVoteBy (votes, subjectUrl) {
        if (!votes) return 0
        if (votes.upvotes.find(url => (url.url || url) === subjectUrl)) return 1
        if (votes.downvotes.find(url => (url.url || url) === subjectUrl)) return -1
        return 0
      }
    };

    // internal
    // =

    function isNonemptyString (v) {
      return v && typeof v === 'string'
    }

    function isUrl (v) {
      try {
        var u = new URL(v);
        return true
      } catch (e) {
        return false
      }
    }

    /**
     * @param {string} author
     * @returns {string|string[]}
     */
    function getFollowsPaths (author) {
      if (author === 'me') {
        return `/profile/follows/*`
      } else if (author) {
        return `/follows/*`
      } else {
        return [
          `/profile/follows/*`,
          `/profile/follows/*/follows/*`
        ]
      }
    }

    /**
     * @param {string} author
     * @param {string} [topic]
     * @returns {string|string[]}
     */
    function getPostsPaths (author, topic = undefined) {
      topic = topic || '*';
      if (author === 'me') {
        return `/profile/posts/${topic}/*`
      } else if (author) {
        return `/posts/${topic}/*`
      } else {
        return [
          `/profile/posts/${topic}/*`,
          `/profile/follows/*/posts/${topic}/*`
        ]
      }
    }

    function getTopicsPaths (author) {
      if (author === 'me') {
        return `/profile/posts/*`
      } else if (author) {
        return `/posts/*`
      } else {
        return [
          `/profile/posts/*`,
          `/profile/follows/*/posts/*`
        ]
      }
    }

    /**
     * @param {string} author
     * @returns {string|string[]}
     */
    function getCommentsPaths (author) {
      if (author === 'me') {
        return `/profile/comments/*.md`
      } else if (author) {
        return `/comments/*.md`
      } else {
        return [
          `/profile/comments/*.md`,
          `/profile/follows/*/comments/*.md`
        ]
      }
    }

    /**
     * @param {string} author
     * @returns {string|string[]}
     */
    function getVotesPaths (author) {
      if (author === 'me') {
        return `/profile/votes/*.goto`
      } else if (author) {
        return `/votes/*.goto`
      } else {
        return [
          `/profile/votes/*.goto`,
          `/profile/follows/*/votes/*.goto`
        ]
      }
    }

    const instanceOfAny = (object, constructors) => constructors.some(c => object instanceof c);

    let idbProxyableTypes;
    let cursorAdvanceMethods;
    // This is a function to prevent it throwing up in node environments.
    function getIdbProxyableTypes() {
        return (idbProxyableTypes ||
            (idbProxyableTypes = [
                IDBDatabase,
                IDBObjectStore,
                IDBIndex,
                IDBCursor,
                IDBTransaction,
            ]));
    }
    // This is a function to prevent it throwing up in node environments.
    function getCursorAdvanceMethods() {
        return (cursorAdvanceMethods ||
            (cursorAdvanceMethods = [
                IDBCursor.prototype.advance,
                IDBCursor.prototype.continue,
                IDBCursor.prototype.continuePrimaryKey,
            ]));
    }
    const cursorRequestMap = new WeakMap();
    const transactionDoneMap = new WeakMap();
    const transactionStoreNamesMap = new WeakMap();
    const transformCache = new WeakMap();
    const reverseTransformCache = new WeakMap();
    function promisifyRequest(request) {
        const promise = new Promise((resolve, reject) => {
            const unlisten = () => {
                request.removeEventListener('success', success);
                request.removeEventListener('error', error);
            };
            const success = () => {
                resolve(wrap(request.result));
                unlisten();
            };
            const error = () => {
                reject(request.error);
                unlisten();
            };
            request.addEventListener('success', success);
            request.addEventListener('error', error);
        });
        promise
            .then(value => {
            // Since cursoring reuses the IDBRequest (*sigh*), we cache it for later retrieval
            // (see wrapFunction).
            if (value instanceof IDBCursor) {
                cursorRequestMap.set(value, request);
            }
            // Catching to avoid "Uncaught Promise exceptions"
        })
            .catch(() => { });
        // This mapping exists in reverseTransformCache but doesn't doesn't exist in transformCache. This
        // is because we create many promises from a single IDBRequest.
        reverseTransformCache.set(promise, request);
        return promise;
    }
    function cacheDonePromiseForTransaction(tx) {
        // Early bail if we've already created a done promise for this transaction.
        if (transactionDoneMap.has(tx))
            return;
        const done = new Promise((resolve, reject) => {
            const unlisten = () => {
                tx.removeEventListener('complete', complete);
                tx.removeEventListener('error', error);
                tx.removeEventListener('abort', error);
            };
            const complete = () => {
                resolve();
                unlisten();
            };
            const error = () => {
                reject(tx.error);
                unlisten();
            };
            tx.addEventListener('complete', complete);
            tx.addEventListener('error', error);
            tx.addEventListener('abort', error);
        });
        // Cache it for later retrieval.
        transactionDoneMap.set(tx, done);
    }
    let idbProxyTraps = {
        get(target, prop, receiver) {
            if (target instanceof IDBTransaction) {
                // Special handling for transaction.done.
                if (prop === 'done')
                    return transactionDoneMap.get(target);
                // Polyfill for objectStoreNames because of Edge.
                if (prop === 'objectStoreNames') {
                    return target.objectStoreNames || transactionStoreNamesMap.get(target);
                }
                // Make tx.store return the only store in the transaction, or undefined if there are many.
                if (prop === 'store') {
                    return receiver.objectStoreNames[1]
                        ? undefined
                        : receiver.objectStore(receiver.objectStoreNames[0]);
                }
            }
            // Else transform whatever we get back.
            return wrap(target[prop]);
        },
        has(target, prop) {
            if (target instanceof IDBTransaction &&
                (prop === 'done' || prop === 'store')) {
                return true;
            }
            return prop in target;
        },
    };
    function addTraps(callback) {
        idbProxyTraps = callback(idbProxyTraps);
    }
    function wrapFunction(func) {
        // Due to expected object equality (which is enforced by the caching in `wrap`), we
        // only create one new func per func.
        // Edge doesn't support objectStoreNames (booo), so we polyfill it here.
        if (func === IDBDatabase.prototype.transaction &&
            !('objectStoreNames' in IDBTransaction.prototype)) {
            return function (storeNames, ...args) {
                const tx = func.call(unwrap(this), storeNames, ...args);
                transactionStoreNamesMap.set(tx, storeNames.sort ? storeNames.sort() : [storeNames]);
                return wrap(tx);
            };
        }
        // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
        // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
        // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
        // with real promises, so each advance methods returns a new promise for the cursor object, or
        // undefined if the end of the cursor has been reached.
        if (getCursorAdvanceMethods().includes(func)) {
            return function (...args) {
                // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
                // the original object.
                func.apply(unwrap(this), args);
                return wrap(cursorRequestMap.get(this));
            };
        }
        return function (...args) {
            // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
            // the original object.
            return wrap(func.apply(unwrap(this), args));
        };
    }
    function transformCachableValue(value) {
        if (typeof value === 'function')
            return wrapFunction(value);
        // This doesn't return, it just creates a 'done' promise for the transaction,
        // which is later returned for transaction.done (see idbObjectHandler).
        if (value instanceof IDBTransaction)
            cacheDonePromiseForTransaction(value);
        if (instanceOfAny(value, getIdbProxyableTypes()))
            return new Proxy(value, idbProxyTraps);
        // Return the same value back if we're not going to transform it.
        return value;
    }
    function wrap(value) {
        // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
        // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
        if (value instanceof IDBRequest)
            return promisifyRequest(value);
        // If we've already transformed this value before, reuse the transformed value.
        // This is faster, but it also provides object equality.
        if (transformCache.has(value))
            return transformCache.get(value);
        const newValue = transformCachableValue(value);
        // Not all types are transformed.
        // These may be primitive types, so they can't be WeakMap keys.
        if (newValue !== value) {
            transformCache.set(value, newValue);
            reverseTransformCache.set(newValue, value);
        }
        return newValue;
    }
    const unwrap = (value) => reverseTransformCache.get(value);

    /**
     * Open a database.
     *
     * @param name Name of the database.
     * @param version Schema version.
     * @param callbacks Additional callbacks.
     */
    function openDB(name, version, { blocked, upgrade, blocking } = {}) {
        const request = indexedDB.open(name, version);
        const openPromise = wrap(request);
        if (upgrade) {
            request.addEventListener('upgradeneeded', event => {
                upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction));
            });
        }
        if (blocked)
            request.addEventListener('blocked', () => blocked());
        if (blocking) {
            openPromise.then(db => db.addEventListener('versionchange', blocking)).catch(() => { });
        }
        return openPromise;
    }

    const readMethods = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'];
    const writeMethods = ['put', 'add', 'delete', 'clear'];
    const cachedMethods = new Map();
    function getMethod(target, prop) {
        if (!(target instanceof IDBDatabase &&
            !(prop in target) &&
            typeof prop === 'string')) {
            return;
        }
        if (cachedMethods.get(prop))
            return cachedMethods.get(prop);
        const targetFuncName = prop.replace(/FromIndex$/, '');
        const useIndex = prop !== targetFuncName;
        const isWrite = writeMethods.includes(targetFuncName);
        if (
        // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
        !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) ||
            !(isWrite || readMethods.includes(targetFuncName))) {
            return;
        }
        const method = async function (storeName, ...args) {
            // isWrite ? 'readwrite' : undefined gzipps better, but fails in Edge :(
            const tx = this.transaction(storeName, isWrite ? 'readwrite' : 'readonly');
            let target = tx.store;
            if (useIndex)
                target = target.index(args.shift());
            const returnVal = target[targetFuncName](...args);
            if (isWrite)
                await tx.done;
            return returnVal;
        };
        cachedMethods.set(prop, method);
        return method;
    }
    addTraps(oldTraps => ({
        get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
        has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop),
    }));

    const advanceMethodProps = ['continue', 'continuePrimaryKey', 'advance'];
    const methodMap = {};
    const advanceResults = new WeakMap();
    const ittrProxiedCursorToOriginalProxy = new WeakMap();
    const cursorIteratorTraps = {
        get(target, prop) {
            if (!advanceMethodProps.includes(prop))
                return target[prop];
            let cachedFunc = methodMap[prop];
            if (!cachedFunc) {
                cachedFunc = methodMap[prop] = function (...args) {
                    advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
                };
            }
            return cachedFunc;
        },
    };
    async function* iterate(...args) {
        // tslint:disable-next-line:no-this-assignment
        let cursor = this;
        if (!(cursor instanceof IDBCursor)) {
            cursor = await cursor.openCursor(...args);
        }
        if (!cursor)
            return;
        cursor = cursor;
        const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
        ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
        // Map this double-proxy back to the original, so other cursor methods work.
        reverseTransformCache.set(proxiedCursor, unwrap(cursor));
        while (cursor) {
            yield proxiedCursor;
            // If one of the advancing methods was not called, call continue().
            cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
            advanceResults.delete(proxiedCursor);
        }
    }
    function isIteratorProp(target, prop) {
        return ((prop === Symbol.asyncIterator &&
            instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor])) ||
            (prop === 'iterate' && instanceOfAny(target, [IDBIndex, IDBObjectStore])));
    }
    addTraps(oldTraps => ({
        get(target, prop, receiver) {
            if (isIteratorProp(target, prop))
                return iterate;
            return oldTraps.get(target, prop, receiver);
        },
        has(target, prop) {
            return isIteratorProp(target, prop) || oldTraps.has(target, prop);
        },
    }));

    /**
     * Notifications Index
     * 
     * We track the version of each followed drive.
     * The index is updated by diffing from the last "checked" version.
     * All updates are filtered for relevance (e.g. likes on my posts) and then recorded.
     * 
     * Indexes are stored in IndexedDB
     * TODO: The number of events kept should be truncated to 300 to avoid performance degradation.
     * 
     * The index should be scheduled to run in the background during idle time.
     * It will update the index-files periodically so that interruption is not an issue.
     * New notifications are updated as-found so that the UI can alert the user asap.
     */

    // typedefs
    // =

    /**
     * @typedef {Object} NotificationEvent
     * @prop {string} event
     * @prop {string} author
     * @prop {number} timestamp
     * @prop {Object} detail
     * @prop {boolean} isRead
     * 
     * @typedef {Object} NotificationsIndex
     * @param {Object} drives
     * @param {Array<NotificationEvent>} events
     * 
     * @typedef {Object} IndexDefinition
     * @param {string} path
     * @param {function (object, object): boolean} filterFn
     * @param {function (object, object): NotificationEvent} toEvent
     */

    // exported api
    // =

    var db = undefined;
    const events = new EventTarget();
    const INDEXES = /** @type IndexDefinition[] */([
      {
        path: '/votes/',
        filterFn (change, {userUrl}) {
          if (change.type !== 'put') return false
          if (!change.value.stat) return false
          var {href} = change.value.stat.metadata;
          if (typeof href !== 'string') return false
          return href.startsWith(userUrl)
        },
        toEvent (change, drive) {
          var {href, vote} = change.value.stat.metadata;
          return {
            event: 'vote',
            author: drive.url,
            timestamp: basename(change.name),
            detail: {href, vote},
            isRead: false
          }
        }
      },
      {
        path: '/comments/',
        filterFn (change, {userUrl}) {
          if (change.type !== 'put') return false
          if (!change.value.stat) return false
          var {href, parent} = change.value.stat.metadata;
          if (typeof href !== 'string') return false
          return href.startsWith(userUrl) || (parent && parent.startsWith(userUrl))
        },
        toEvent (change, drive) {
          var {href, parent} = change.value.stat.metadata;
          return {
            event: 'comment',
            author: drive.url,
            timestamp: basename(change.name),
            detail: {href, parent},
            isRead: false
          }
        }
      },
      {
        path: '/follows/',
        filterFn (change, {userUrl}) {
          if (change.type !== 'mount') return false
          if (!change.value.mount) return false
          return isKeyEq(change.value.mount.key, userUrl)
        },
        toEvent (change, drive) {
          return {
            event: 'follow',
            author: drive.url,
            timestamp: change.stat.ctime,
            detail: {},
            isRead: false
          }
        }
      }
    ]);

    /**
     * @returns {void}
     */
    async function setup () {
      db = await openDB('index:notifications', 1, { 
        upgrade (db, oldVersion, newVersion, transaction) {
          var eventsStore = db.createObjectStore('events', {keyPath: 'timestamp'});
          var drivesStore = db.createObjectStore('drives', {keyPath: 'url'});
        },
        blocked () {
          // TODO do we need to handle this?
          console.debug('index:notifications DB is blocked');
        },
        blocking () {
          // TODO do we need to handle this?
          console.debug('index:notifications DB is blocking');
        }
      });
    }

    /**
     * @param {Object} [opts]
     * @param {number} [opts.offset]
     * @param {number} [opts.limit]
     * @returns {Promise<NotificationEvent[]>}
     */
    async function list ({offset, limit} = {offset: 0, limit: 50}) {
      if (!db) await setup();
      var end = offset + limit;
      var index = 0;
      var results = [];
      var tx = db.transaction('events', 'readonly');
      for await (let cursor of tx.store.iterate(undefined, 'prev')) {
        if (index >= offset) results.push(cursor.value);
        index++;
        if (index >= end) break
      }
      return results
    }

    /**
     * @param {Object} [opts] 
     * @param {boolean} [opts.isUnread] 
     */
    async function count ({isUnread} = {isUnread: false}) {
      if (!db) await setup();
      if (!isUnread) return db.count('events')
      var count = 0;
      var tx = db.transaction('events', 'readonly');
      for await (let cursor of tx.store) {
        if (!cursor.value.isRead) {
          count++;
        }
      }
      return count
    }

    /**
     * @returns {Promise<void>}
     */
    async function markAllRead () {
      if (!db) await setup();
      var release = await lock('notifications-update');
      try {
        var tx = db.transaction('events', 'readwrite');
        for await (let cursor of tx.store) {
          if (!cursor.value.isRead) {
            cursor.value.isRead = true;
            cursor.update(cursor.value);
          }
        }
        await tx.done;
      } finally {
        release();
      }
    }


    /**
     * @param {string} userUrl 
     * @returns {Promise<void>}
     */
    async function updateIndex (userUrl) {
      if (!db) await setup();
      var release = await lock('notifications-update');
      try {
        var filterOpts = {userUrl};
        var followedUsers = await navigator.filesystem.query({
          type: 'mount',
          path: [
            '/profile/follows/*',
            '/profile/follows/*/follows/*',
          ]
        });
        var userKeySet = new Set(followedUsers.map(f => f.mount));

        for (let userKey of userKeySet) {
          let drive = new Hyperdrive(userKey);
          let driveMeta = await db.get('drives', drive.url);
          let lastVersion = driveMeta ? driveMeta.version : undefined;
          let currentVersion = (await drive.getInfo()).version;
          if (typeof lastVersion !== 'number') {
            lastVersion = currentVersion;
          }

          let numNewEvents = 0;
          for (let INDEX of INDEXES) {
            let changes = await drive.diff(lastVersion, INDEX.path);
            for (let change of changes) {
              if (!INDEX.filterFn(change, filterOpts)) continue
              let evt = INDEX.toEvent(change, drive);
              await db.put('events', evt);
              numNewEvents++;
            }
          }

          await db.put('drives', {url: drive.url.toString(), version: currentVersion});
          if (numNewEvents > 0) {
            events.dispatchEvent(new CustomEvent('new-events', {detail: {numNewEvents}}));
          }
        }
      } finally {
        release();
      }
    }

    // internal methods
    // =

    var keyRegex = /([0-9a-f]{64})/i;
    /**
     * @param {string} a 
     * @param {string} b 
     * @returns {Boolean}
     */
    function isKeyEq (a = '', b = '') {
      return keyRegex.exec(a)[0] === keyRegex.exec(b)[0]
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    function basename (value) {
      return value.split('/').pop().split('.')[0]
    }

    var debugDrives = createPersistedArray('debug-drives');

    function init () {
      instrument(Hyperdrive.prototype);
    }

    function listDrives () {
      return Array.from(debugDrives, url => `beaker://social/${url.slice('hd://'.length)}`)
    }

    async function generateDrives (num = 10) {
      if (!confirm('This will generate a lot of test drives. Continue?')) {
        return
      }

      for (let i = 0; i < num; i++) {
        let profile = FAKE_PROFILES[(i + debugDrives.length) % FAKE_PROFILES.length];
        let drive = await Hyperdrive.create(Object.assign(profile, {type: 'unwalled.garden/person', prompt: false}));
        debugDrives.push(drive.url);
        await follows.add(drive.url, profile.title);
      }
    }

    async function socializeDrives () {
      var driveUrls = Array.from(debugDrives);
      for (let driveUrl of driveUrls) {
        let drive = new Hyperdrive(driveUrl);
        var numFollows = Math.floor(Math.random() * driveUrls.length);
        console.log('Adding', numFollows, 'follows for', driveUrl);
        for (let i = 0; i < numFollows; i++) {
          let followUrl = getRandomOtherThan(driveUrls, driveUrl);
          let followProfile = await (new Hyperdrive(followUrl)).getInfo();
          console.log('following', followUrl, followProfile.title);
          await follows.add(followUrl, followProfile.title, drive);
        }
      }
    }

    async function generatePosts (numPosts = 10) {
      var driveUrls = Array.from(debugDrives);
      var fake_post_words = FAKE_POST.split(' ');
      for (let i = 0; i < numPosts; i++) {
        for (let driveUrl of driveUrls) {
          let drive = new Hyperdrive(driveUrl);
          let numWords = Math.min(Math.floor(Math.random() * fake_post_words.length), 30) + 1;
          let startWord = Math.floor(Math.random() * numWords);
          let title = fake_post_words.slice(startWord, numWords).join(' ');
          await posts.addLink({
            href: 'https://beakerbrowser.com',
            title,
            topic: 'debug posts'
          }, drive);
        }
      }
    }

    async function generateComments (numComments = 10) {
      var driveUrls = Array.from(debugDrives);
      var fake_post_words = FAKE_POST.split(' ');
      for (let i = 0; i < numComments; i++) {
        for (let driveUrl of driveUrls) {
          let drive = new Hyperdrive(driveUrl);
          let numWords = Math.min(Math.floor(Math.random() * fake_post_words.length)) + 1;
          let startWord = Math.floor(Math.random() * numWords);
          let content = fake_post_words.slice(startWord, numWords).join(' ');
          let post = await getRandomPost();
          let parentComment = (Math.random() > 0.5) ? await getRandomCommentOnPost(post) : undefined;
          await comments.add({
            href: post.url,
            parent: parentComment ? parentComment.url : undefined,
            content
          }, drive);
        }
      }
    }

    async function generateVotes (numVotes = 100) {
      var driveUrls = Array.from(debugDrives);
      for (let i = 0; i < numVotes; i++) {
        for (let driveUrl of driveUrls) {
          let drive = new Hyperdrive(driveUrl);
          let target = await getRandomPostOrComment();
          await votes.put(target.url, (Math.random() > 0.7) ? -1 : 1, drive);
        }
      }
    }

    async function deleteDrives () {
      if (!confirm('Delete all test drives?')) {
        return
      }

      for (let url of debugDrives) {
        console.debug('Unlinking', url);
        await follows.remove(url).catch(e => undefined);
        await ensureUnmountByUrl('/system/drives/*', url);
      }
      debugDrives.length = 0;
    }

    // internal
    // =

    async function getRandomPost () {
      var posts$1 = await posts.list({limit: 50}, {includeProfiles: true});
      return posts$1[Math.floor(Math.random() * posts$1.length)]
    }

    async function getRandomCommentOnPost (post) {
      var comments$1 = await comments.list({limit: 50, href: post.url});
      return comments$1[Math.floor(Math.random() * comments$1.length)]
    }

    async function getRandomPostOrComment () {
      var [posts$1, comments$1] = await Promise.all([
        posts.list({limit: 50}, {includeProfiles: true}),
        await comments.list({limit: 50})
      ]);
      var candidates = posts$1.concat(comments$1);
      return candidates[Math.floor(Math.random() * candidates.length)]
    }

    function getRandomOtherThan (values, valueNotToTake) {
      let v = undefined;
      while (!v || v === valueNotToTake) {
        v = values[Math.floor(values.length * Math.random())];
      }
      return v
    }

    /**
     * @param {string} id 
     * @returns {Array}
     */
    function createPersistedArray (id) {
      function read () { try { return JSON.parse(localStorage[id]) } catch (e) { return [] } }
      function write (values) { localStorage[id] = JSON.stringify(values); }
      return /** @type Array */(new Proxy({}, {
        get (obj, k) { return read()[k] },
        set (obj, k, v) { var values = read(); values[k] = v; write(values); return true },
        deleteProperty (obj, k) { var values = read(); delete values[k]; write(values); return true }
      }))
    }

    function instrument (obj) {
      Object.getOwnPropertyNames(obj).forEach(k => {
        if (typeof obj[k] !== 'function') return
        let fn = obj[k];
        obj[k] = async function (...args) {
          let t = Date.now();
          console.debug(`➡️${k}(`, ...args, ')');
          var res = await fn.apply(this, args);
          console.debug(`🏁${(Date.now() - t)}ms`, `${k}(`, ...args, ')');
          return res
        };
      });
    }

    const FAKE_POST = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

    const FAKE_PROFILES = [
      {
        "title": "Deirdre Richardson",
        "description": "In fugiat reprehenderit voluptate magna ipsum quis ullamco. Officia aute in ad exercitation adipisicing. Sit incididunt Lorem quis sunt aliquip reprehenderit sint magna proident tempor nisi fugiat. Minim elit magna commodo adipisicing fugiat minim aliquip adipisicing cupidatat amet sint ut deserunt duis. Ea cillum enim reprehenderit est labore aliqua minim.\r\n"
      },
      {
        "title": "Swanson Perry",
        "description": "Dolore culpa cillum adipisicing do. Est non magna culpa do qui reprehenderit. Reprehenderit sunt ad nulla ullamco. Cillum cupidatat velit sit officia nostrud elit nisi veniam ut deserunt ad. Ullamco et deserunt velit Lorem laboris. Esse et eu commodo excepteur labore duis tempor ad ea labore exercitation.\r\n"
      },
      {
        "title": "Yesenia Anthony",
        "description": "Nostrud voluptate laborum occaecat minim ea dolore id qui officia ullamco magna. Aliqua quis excepteur minim eiusmod deserunt incididunt sit deserunt dolor minim. Esse veniam reprehenderit labore enim magna ad Lorem proident et esse ullamco et.\r\n"
      },
      {
        "title": "Jamie Glenn",
        "description": "Ea est culpa anim esse ullamco sint velit do ipsum nostrud aute. Exercitation voluptate id elit sunt. Excepteur anim officia aute do ex voluptate occaecat ullamco consequat labore ad nulla. Id do exercitation eu ipsum adipisicing esse cillum duis sunt culpa ipsum. Consectetur et laborum in culpa laboris ea. Occaecat minim id dolor id.\r\n"
      },
      {
        "title": "Blackwell Ryan",
        "description": "Laboris ut aute qui consequat in excepteur amet ullamco proident enim. Id aliqua eu adipisicing aliquip pariatur. Adipisicing irure voluptate aute magna consequat do labore esse minim commodo exercitation amet. Et commodo do elit est deserunt sit elit ipsum velit laboris dolor id laborum esse. Ut cillum occaecat id cupidatat esse fugiat nostrud enim. Pariatur non enim non qui sunt et excepteur enim ad cillum. Sunt laboris exercitation cupidatat excepteur dolor nisi.\r\n"
      },
      {
        "title": "Kris Grimes",
        "description": "Magna proident aliquip non cupidatat tempor adipisicing Lorem. Pariatur eiusmod cupidatat elit et nulla amet tempor voluptate. In culpa nisi amet amet duis mollit adipisicing consequat magna officia consequat labore anim.\r\n"
      },
      {
        "title": "Gena Manning",
        "description": "Commodo tempor nulla laborum consectetur ullamco. Quis quis consectetur amet do ex pariatur anim aliqua deserunt. Et dolor sint anim velit non labore dolore consequat officia ad nisi pariatur. Ut duis est enim nisi aliqua eiusmod do enim. Id minim adipisicing excepteur velit et cupidatat voluptate aliquip. Amet minim sunt culpa qui minim incididunt dolor velit ullamco sit anim enim mollit quis.\r\n"
      },
      {
        "title": "Whitehead Barker",
        "description": "Ut magna tempor ullamco excepteur laborum commodo voluptate laborum commodo deserunt dolore consequat mollit. Est veniam proident adipisicing nisi laborum excepteur nulla id ea. Sit sint pariatur in id in aliqua eiusmod non labore qui aute incididunt. Do et culpa aliqua quis tempor amet. Est consectetur aliqua aliqua velit labore ullamco eu. Exercitation nulla est elit elit sint nulla occaecat dolor. Sit id exercitation ut id.\r\n"
      },
      {
        "title": "Marina Hyde",
        "description": "Deserunt velit aute ipsum qui mollit cillum deserunt eiusmod elit commodo. Duis veniam exercitation irure id laborum. Adipisicing Lorem id Lorem consectetur commodo consequat sunt mollit eiusmod ut exercitation ut labore. Lorem reprehenderit eiusmod commodo ad sit est consectetur consequat exercitation nisi id adipisicing. Aliqua incididunt nostrud excepteur tempor tempor pariatur in esse amet. Consequat est voluptate cillum non aute qui ea ad Lorem.\r\n"
      },
      {
        "title": "Cabrera Joyce",
        "description": "Lorem nulla commodo aliqua ullamco. Fugiat incididunt laboris minim consectetur laborum sunt adipisicing magna. Culpa ex non ex tempor qui enim id ea dolor reprehenderit nulla ullamco. Exercitation incididunt magna ad dolore consequat anim. Eiusmod nulla ullamco cillum exercitation velit mollit veniam cupidatat ut eu reprehenderit id. Sunt laborum pariatur ut cillum anim proident eiusmod reprehenderit proident veniam duis veniam labore. Labore veniam fugiat aliqua cupidatat cupidatat anim anim exercitation minim in nostrud.\r\n"
      },
      {
        "title": "Inez Bryant",
        "description": "Sit adipisicing aute aliquip officia amet amet qui anim enim laboris ex tempor sint. Tempor incididunt consectetur id non laborum. Eiusmod consequat labore quis sint non eu ad sint culpa ut. Consectetur in enim laborum officia veniam cillum anim excepteur ullamco esse eu culpa fugiat et. Amet aliqua laboris eu dolor non et excepteur do laboris est. In ut labore eu anim dolore officia nisi cupidatat ea irure aliqua. Sunt exercitation officia officia pariatur sint nisi culpa consectetur do Lorem officia nisi fugiat ut.\r\n"
      },
      {
        "title": "Dianne Trevino",
        "description": "Non sint magna nisi occaecat Lorem incididunt cupidatat occaecat ut. Dolore aliqua non exercitation culpa magna Lorem. Occaecat qui anim non do dolore est cillum et enim et dolore voluptate cillum cillum. Minim sit occaecat in irure minim velit enim voluptate est pariatur ad voluptate. Ad reprehenderit laborum non dolor irure eu cupidatat ex proident excepteur minim velit voluptate. Nisi nostrud amet anim cupidatat id. Ipsum dolor aliquip adipisicing veniam qui dolore qui laboris duis dolore cupidatat dolor.\r\n"
      },
      {
        "title": "Mavis Frost",
        "description": "Non laborum Lorem cillum quis enim. Velit irure voluptate deserunt et sit anim qui. Ad est fugiat enim incididunt aliqua dolore qui. Elit cupidatat magna ullamco do Lorem cupidatat esse id ipsum labore id mollit irure. Mollit fugiat id dolor laborum. Mollit esse amet occaecat sit ipsum elit mollit eiusmod deserunt deserunt. Non labore nisi dolore incididunt laboris occaecat.\r\n"
      },
      {
        "title": "Lawson Hunt",
        "description": "Mollit Lorem occaecat ullamco eiusmod amet dolor fugiat. Commodo duis laboris laboris duis nisi pariatur. Adipisicing deserunt mollit velit ut nostrud voluptate nulla incididunt elit veniam deserunt. Non do minim excepteur culpa.\r\n"
      },
      {
        "title": "Hester Kirkland",
        "description": "Enim aliqua ex nisi aute eiusmod ullamco dolor. Non id culpa consectetur elit in Lorem amet quis veniam in aliquip est nisi. Elit velit commodo occaecat cillum. Sit in ut fugiat amet tempor sit adipisicing commodo et id aliquip incididunt. Irure eiusmod proident duis duis officia tempor ipsum voluptate labore do est ad.\r\n"
      },
      {
        "title": "Riddle Whitney",
        "description": "Ipsum eiusmod fugiat minim nisi sint eiusmod mollit laborum nulla duis nisi aute do. Deserunt dolor ea sunt officia adipisicing irure enim aliquip magna ut veniam. Reprehenderit tempor amet ullamco aliqua proident mollit officia.\r\n"
      },
      {
        "title": "Ericka Hammond",
        "description": "Aliqua dolor culpa esse proident fugiat mollit labore nisi veniam fugiat id. Adipisicing sint nisi deserunt enim proident eu nostrud. Incididunt est incididunt irure non ex magna esse aliqua commodo voluptate enim incididunt fugiat. Laboris ipsum cupidatat ad sunt occaecat.\r\n"
      },
      {
        "title": "Becker Lowe",
        "description": "Excepteur amet incididunt exercitation deserunt pariatur est quis irure. Consequat in occaecat enim labore mollit. Pariatur culpa amet Lorem labore laborum amet.\r\n"
      },
      {
        "title": "Kaufman Houston",
        "description": "Ut laboris eu minim fugiat laborum cillum eiusmod. Sunt labore Lorem ex ut excepteur aliqua aliqua fugiat quis consequat dolore ea Lorem. Tempor mollit occaecat officia non est ipsum nisi mollit veniam aliqua quis.\r\n"
      },
      {
        "title": "Chris Wallace",
        "description": "Mollit elit qui consequat amet. Ad consequat minim veniam proident ut sint. Excepteur occaecat ex consectetur adipisicing amet. Ullamco cupidatat est dolore dolore ex mollit labore est. Labore mollit esse magna reprehenderit in reprehenderit veniam cupidatat nulla culpa ipsum dolore. Ex aliquip excepteur incididunt quis cupidatat aute esse.\r\n"
      },
      {
        "title": "Elinor Barnes",
        "description": "Exercitation incididunt ex deserunt est exercitation. Minim veniam non officia reprehenderit mollit quis consequat consectetur officia amet irure sunt eiusmod fugiat. Adipisicing consequat irure culpa id Lorem.\r\n"
      },
      {
        "title": "Barker Moreno",
        "description": "Deserunt proident mollit commodo exercitation officia nulla Lorem. Amet deserunt sit in velit magna adipisicing Lorem sunt cupidatat commodo ullamco. Velit consectetur ex velit reprehenderit labore. Consectetur proident ea aliqua officia cupidatat commodo minim culpa cupidatat voluptate pariatur excepteur. Dolor et et et sunt sit ut excepteur anim do sint ipsum. Pariatur deserunt aute tempor eu esse.\r\n"
      },
      {
        "title": "Silvia Carney",
        "description": "Mollit aliqua amet non ex eu qui tempor mollit consectetur tempor nisi occaecat aliquip. Reprehenderit voluptate et est enim est nostrud nisi dolore do nisi excepteur. Sint id dolor irure irure duis dolor est duis. Minim nostrud aliqua laboris sunt excepteur occaecat magna occaecat anim pariatur mollit do. Dolore esse nulla est irure ea pariatur nostrud fugiat non dolore amet exercitation dolor. Excepteur mollit deserunt ea quis proident nulla.\r\n"
      },
      {
        "title": "Gray Gomez",
        "description": "Labore eiusmod nostrud ad officia ex ad dolore. Occaecat sit ex ex incididunt ea ullamco qui minim veniam. Ipsum irure velit adipisicing ad.\r\n"
      },
      {
        "title": "Cara Vasquez",
        "description": "Commodo aliquip minim dolor aliqua aliquip tempor irure. Nulla amet eu minim mollit deserunt magna magna id. Duis pariatur mollit irure consequat eu. Excepteur anim sint veniam non et laboris id proident ex laborum irure.\r\n"
      },
      {
        "title": "Myrtle Chang",
        "description": "Non ea et sunt id proident ipsum. Proident aute dolore fugiat ullamco deserunt quis dolore dolor voluptate aliqua pariatur mollit tempor eu. Nisi sint adipisicing deserunt cillum adipisicing non consequat est irure voluptate in. Minim id dolor incididunt duis excepteur cillum laborum enim aliquip eiusmod qui et minim consectetur. Exercitation ullamco nisi eiusmod non aliqua. Velit est in eiusmod sunt sit. Ut quis sit amet ullamco proident aute nisi occaecat enim.\r\n"
      },
      {
        "title": "Lakeisha Hooper",
        "description": "Cillum nostrud laboris eiusmod ea aliqua est nostrud excepteur aliquip pariatur adipisicing occaecat. Cillum in mollit id culpa nostrud ex enim commodo qui et ex nostrud laboris aliquip. Exercitation do nulla voluptate sit officia dolore. Id pariatur esse duis commodo adipisicing Lorem. Sunt eiusmod minim consequat do cupidatat esse do cupidatat eu. Minim enim sunt nulla culpa. Incididunt eu tempor do commodo aliqua enim sint voluptate proident dolor.\r\n"
      },
      {
        "title": "Ross Graham",
        "description": "Minim eu amet dolore proident dolore dolore elit enim sint incididunt sit anim voluptate anim. Et amet eiusmod voluptate eiusmod. Ipsum labore duis velit qui consequat nulla cupidatat officia duis. Culpa eiusmod proident ex voluptate.\r\n"
      },
      {
        "title": "Shepherd Miller",
        "description": "Ipsum minim magna ullamco dolore duis cupidatat non nulla. Ullamco nulla consequat amet nisi esse minim velit exercitation. Mollit reprehenderit elit officia laboris amet aliqua sunt laborum sunt fugiat sit do. Exercitation sunt amet laborum mollit ea. Deserunt sint incididunt officia sunt.\r\n"
      },
      {
        "title": "England Wilkinson",
        "description": "Pariatur incididunt aliquip ex veniam eu duis ad elit pariatur pariatur ipsum amet officia eiusmod. Ea tempor Lorem aliqua cillum aliqua quis. Veniam aliquip pariatur pariatur exercitation cupidatat aute aliquip reprehenderit in ex aute occaecat labore minim. Irure velit tempor ullamco exercitation est officia do non veniam laboris labore et irure.\r\n"
      },
      {
        "title": "Nadia Schultz",
        "description": "Consequat ut nisi excepteur consequat sunt officia mollit. Labore in magna eiusmod nulla nulla. Cupidatat nostrud laborum voluptate ut occaecat occaecat nostrud sit. Irure nostrud dolor excepteur id nisi nulla eiusmod excepteur dolor consequat do qui.\r\n"
      },
      {
        "title": "Courtney Neal",
        "description": "Anim cillum in do occaecat incididunt deserunt eu qui dolore cillum amet. Reprehenderit amet culpa officia amet. Tempor eiusmod nisi amet Lorem esse consectetur non laboris labore deserunt commodo cupidatat magna ullamco. Tempor magna elit enim eu ut velit officia adipisicing nostrud amet tempor. In ad excepteur veniam consectetur ipsum ex dolore.\r\n"
      },
      {
        "title": "Julie Robles",
        "description": "Elit officia ea ut eiusmod deserunt mollit adipisicing mollit. Ea nisi qui ullamco ea veniam laborum fugiat eu voluptate non adipisicing dolore ut. Pariatur adipisicing id fugiat esse velit cupidatat laborum exercitation fugiat sint pariatur proident.\r\n"
      },
      {
        "title": "Darlene Little",
        "description": "Sint fugiat commodo nostrud veniam sit ex cillum. Commodo est veniam reprehenderit nostrud pariatur quis sint pariatur. Laboris nisi proident cupidatat amet laboris quis. Est irure occaecat eu esse aute.\r\n"
      },
      {
        "title": "Ella Campos",
        "description": "Culpa Lorem incididunt dolor sunt commodo magna. Incididunt ipsum anim nisi ex consectetur. Fugiat aliquip est pariatur elit ipsum sit nisi nostrud est ea adipisicing. Est ipsum culpa aliquip est ullamco anim. Sunt sint cillum dolore quis aliqua occaecat. Anim commodo nulla ipsum velit consectetur amet mollit sit. Cillum ex et cupidatat voluptate tempor voluptate mollit sunt.\r\n"
      },
      {
        "title": "Rose Gilmore",
        "description": "Fugiat ullamco dolore nostrud qui exercitation nisi ipsum est. In id aliqua veniam reprehenderit nostrud culpa dolore proident ullamco ex. Et elit cillum dolore proident reprehenderit fugiat pariatur minim. Reprehenderit mollit minim quis incididunt et. Dolore in sit reprehenderit irure cupidatat tempor nulla irure. Laboris reprehenderit quis aliqua excepteur.\r\n"
      },
      {
        "title": "Lesa Valencia",
        "description": "Mollit qui excepteur tempor esse aliqua enim consequat officia cillum commodo nisi duis. Id sint excepteur fugiat in consectetur. Deserunt quis nulla consequat ea ipsum occaecat nulla.\r\n"
      },
      {
        "title": "Bright Spears",
        "description": "Lorem velit irure eu quis in Lorem aliqua culpa. Enim Lorem non occaecat dolor. Ut nostrud ullamco pariatur sunt fugiat tempor exercitation incididunt occaecat voluptate. Exercitation esse ipsum voluptate aute Lorem. Tempor et laboris laboris magna cillum aliqua dolor eiusmod. Laborum excepteur adipisicing dolore proident aliquip tempor aute duis. Ex fugiat culpa laboris minim culpa culpa ullamco labore ullamco.\r\n"
      },
      {
        "title": "Lorie Short",
        "description": "Quis dolore aliqua aute enim aliquip laboris pariatur commodo dolore dolore. Commodo reprehenderit sint magna eu laborum magna fugiat laboris minim mollit. Anim ipsum ut deserunt incididunt cupidatat sunt fugiat mollit eiusmod. Excepteur consectetur adipisicing enim ex adipisicing aliqua dolore velit tempor sint dolor laborum commodo reprehenderit. Proident fugiat nisi nisi sint officia elit. Pariatur mollit reprehenderit aliquip ad officia. Et do laborum proident eiusmod aliquip tempor pariatur sint velit pariatur ipsum et.\r\n"
      },
      {
        "title": "Wilkins Hardy",
        "description": "Nisi nulla fugiat pariatur officia eu veniam quis sit commodo eiusmod. Fugiat irure sint labore consequat incididunt adipisicing commodo fugiat sunt nisi. Et consequat deserunt labore proident qui ad quis officia est. Nostrud anim elit culpa nulla enim. Nulla Lorem pariatur proident aliquip veniam qui occaecat.\r\n"
      },
      {
        "title": "Davis Mueller",
        "description": "Minim labore Lorem culpa cupidatat ullamco in laborum pariatur. Enim aliqua laborum occaecat enim. Eiusmod fugiat in voluptate non Lorem id reprehenderit amet consectetur pariatur qui. Id laboris eiusmod ex adipisicing ut eiusmod aliqua. Ex ut dolore elit labore deserunt enim in consequat. Duis nostrud incididunt excepteur dolore minim minim in velit officia adipisicing et do duis labore. Qui laboris minim deserunt esse ea aliqua.\r\n"
      },
      {
        "title": "Nola Kramer",
        "description": "Consequat velit non ex laborum sunt consequat officia elit nulla irure fugiat ut Lorem. Nostrud reprehenderit ex cillum ut non culpa voluptate. Et nostrud duis consectetur voluptate enim. Dolor non eu ut voluptate esse quis minim incididunt tempor ullamco magna labore sint do. Et ea pariatur adipisicing sint. Elit commodo labore veniam irure.\r\n"
      },
      {
        "title": "Roy Sellers",
        "description": "Lorem consectetur laboris aliqua reprehenderit commodo et Lorem laborum dolor aliquip pariatur. Mollit occaecat enim officia proident reprehenderit nulla aliquip aliqua ipsum. Duis fugiat et aute occaecat ea aliquip velit dolor. Mollit sunt occaecat aliqua adipisicing enim dolor veniam ex eu fugiat amet et dolore.\r\n"
      },
      {
        "title": "Beverley Miranda",
        "description": "Quis consectetur ea id dolor Lorem ea ad ipsum incididunt officia amet. Excepteur fugiat pariatur reprehenderit ut. Labore exercitation nulla dolor tempor tempor. Eu id excepteur veniam aute. Do nulla commodo labore minim elit dolore minim eiusmod pariatur nulla cupidatat et laborum labore.\r\n"
      },
      {
        "title": "Dawn Bates",
        "description": "Irure laboris pariatur culpa esse exercitation. Aliquip tempor nulla laboris duis consectetur ipsum exercitation excepteur cupidatat. Id ullamco consequat adipisicing officia eiusmod adipisicing fugiat in dolore aliqua aliquip. Ut officia proident consequat ea mollit reprehenderit culpa elit minim.\r\n"
      },
      {
        "title": "Hannah Lang",
        "description": "Ex magna tempor in tempor id. Fugiat ut ipsum do ad nostrud officia cupidatat aliquip deserunt dolor. Pariatur veniam excepteur reprehenderit proident velit fugiat ipsum. Nulla irure minim nostrud quis. Do duis est nostrud duis amet anim tempor voluptate sit anim anim anim ea.\r\n"
      },
      {
        "title": "Cortez Slater",
        "description": "Ad anim ullamco ipsum ex adipisicing. Commodo in exercitation veniam est. Ipsum excepteur qui aute ex. Minim ea dolor et labore do non laboris sit ullamco.\r\n"
      },
      {
        "title": "Bradshaw Jordan",
        "description": "Pariatur pariatur ut occaecat fugiat minim magna est commodo cillum esse. Nostrud nulla et magna excepteur sit do irure cillum amet adipisicing non culpa id esse. Velit tempor exercitation nostrud occaecat aliquip reprehenderit aliquip culpa laborum ut veniam id voluptate. Adipisicing duis mollit ipsum aliqua est. Aute esse officia fugiat veniam quis nostrud et veniam laboris. Enim magna Lorem fugiat magna amet qui dolor eu magna occaecat. Officia tempor irure irure consequat enim cupidatat proident proident dolore ipsum ut reprehenderit cillum.\r\n"
      },
      {
        "title": "Waller Mathews",
        "description": "Labore eiusmod proident exercitation Lorem officia officia adipisicing. Incididunt occaecat sint eiusmod nisi qui tempor ullamco duis adipisicing Lorem eu Lorem minim voluptate. Duis aliquip irure laborum nulla laborum aute ipsum ut occaecat eu. Exercitation sunt do do sint dolor cillum fugiat et mollit pariatur veniam.\r\n"
      },
      {
        "title": "Taylor Griffith",
        "description": "Laborum culpa sint elit sit aliquip qui est deserunt. Esse sint tempor mollit amet labore in nostrud aliquip ex minim anim. Ullamco et enim officia dolor dolor qui in minim nostrud. Incididunt sint eu sit eu. Exercitation eiusmod aliquip nulla aute minim exercitation id.\r\n"
      },
      {
        "title": "Elba Stevens",
        "description": "Esse ad veniam voluptate consequat. Enim adipisicing ea cupidatat in minim nulla anim cillum laboris ad ea. Dolore pariatur sint proident velit officia reprehenderit ipsum reprehenderit id deserunt elit fugiat anim ea. Occaecat ex pariatur officia veniam elit fugiat id aliqua qui.\r\n"
      }
    ];

    var tutil = /*#__PURE__*/Object.freeze({
        __proto__: null,
        init: init,
        listDrives: listDrives,
        generateDrives: generateDrives,
        socializeDrives: socializeDrives,
        generatePosts: generatePosts,
        generateComments: generateComments,
        generateVotes: generateVotes,
        deleteDrives: deleteDrives
    });

    const cssStr = css`
.empty {
  background: #fafafe;
  padding: 50px 0;
  color: #889;
  text-align: center;
  border-radius: 8px;
}

.empty .fas {
  font-size: 85px;
  margin-bottom: 30px;
  color: #ccc;
}
`;

    const cssStr$1 = css`
.spinner {
  display: inline-block;
  height: 14px;
  width: 14px;
  animation: rotate 1s infinite linear;
  color: #aaa;
  border: 1.5px solid;
  border-right-color: transparent;
  border-radius: 50%;
  transition: color 0.25s;
}

.spinner.reverse {
  animation: rotate 2s infinite linear reverse;
}

@keyframes rotate {
  0%    { transform: rotate(0deg); }
  100%  { transform: rotate(360deg); }
}
`;

    const cssStr$2 = css`
*[data-tooltip] {
  position: relative;
}

*[data-tooltip]:hover:before,
*[data-tooltip]:hover:after {
  display: block;
  z-index: 1000;
  transition: opacity 0.01s ease;
  transition-delay: 0.2s;
}

*[data-tooltip]:hover:after {
  opacity: 1;
}

*[data-tooltip]:hover:before {
  transform: translate(-50%, 0);
  opacity: 1;
}

*[data-tooltip]:before {
  opacity: 0;
  transform: translate(-50%, 0);
  position: absolute;
  top: 33px;
  left: 50%;
  z-index: 3000;
  content: attr(data-tooltip);
  background: rgba(17, 17, 17, 0.95);
  font-size: 0.7rem;
  border: 0;
  border-radius: 4px;
  padding: 7px 10px;
  color: rgba(255, 255, 255, 0.925);
  text-transform: none;
  text-align: center;
  font-weight: 500;
  white-space: pre;
  line-height: 1;
  pointer-events: none;
  max-width: 300px;
}

*[data-tooltip]:after {
  opacity: 0;
  position: absolute;
  left: calc(50% - 6px);
  top: 28px;
  content: '';
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid rgba(17, 17, 17, 0.95);
  pointer-events: none;
}

.tooltip-nodelay[data-tooltip]:hover:before,
.tooltip-nodelay[data-tooltip]:hover:after {
  transition-delay: initial;
}

.tooltip-right[data-tooltip]:before {
  top: 50%;
  left: calc(100% + 6px);
  transform: translate(0, -50%);
  line-height: 0.9;
}

.tooltip-right[data-tooltip]:after {
  top: 50%;
  left: calc(100% + 0px);
  transform: translate(0, -50%);
  border: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 6px solid rgba(17, 17, 17, 0.95);
}

.tooltip-left[data-tooltip]:before {
  top: 50%;
  left: auto;
  right: calc(100% + 6px);
  transform: translate(0, -50%);
  line-height: 0.9;
}

.tooltip-left[data-tooltip]:after {
  top: 50%;
  left: auto;
  right: calc(100% + 0px);
  transform: translate(0, -50%);
  border: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 6px solid rgba(17, 17, 17, 0.95);
}
`;

    const cssStr$3 = css`
${cssStr}
${cssStr$1}
${cssStr$2}

:host {
  display: block;
}

.layout {
  margin: 0 auto;
}

.layout.narrow {
  max-width: 640px;
}

.layout.left-col {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-gap: 10px;
}

.layout.right-col {
  display: grid;
  grid-template-columns: 1fr 240px;
  grid-gap: 10px;
}

.layout.split-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-gap: 10px;
}

@media (max-width: 900px) {
  .layout.right-col {
    grid-template-columns: 1fr;
  }
  .layout.right-col > :last-child {
    display: none;
  }
}

header {
  display: flex;
  align-items: center;
  margin: 10px 6px 10px;
  letter-spacing: 0.75px;
}

header a {
  display: block;
  color: #556;
  font-weight: 500;
  text-decoration: none;
  font-size: 14px;
  padding: 2px 0;
  margin-right: 20px;
}

header a:last-child {
  margin-right: 0px;
}

header a:hover {
  color: var(--blue);
}
header a.highlighted {
  color: var(--red);
}

header .brand {
  position: relative;
  padding-left: 20px;
}

header .logo {
  position: absolute;
  top: 3px;
  left: 0;
  width: 16px;
  height: 16px;
}

header .spacer {
  flex: 1;
}

nav.pills {
  display: flex;
  margin: 0 0 10px;
  font-size: 13px;
  letter-spacing: 0.5px;
}

nav.pills a {
  padding: 6px 16px;
  border-radius: 4px;
  margin-right: 4px;
  color: inherit;
  text-decoration: none;
}

nav.pills a.selected,
nav.pills a:hover {
  cursor: pointer;
  background: #eaeaf3;
}

`;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // Helper functions for manipulating parts
    // TODO(kschaaf): Refactor into Part API?
    const createAndInsertPart = (containerPart, beforePart) => {
        const container = containerPart.startNode.parentNode;
        const beforeNode = beforePart === undefined ? containerPart.endNode :
            beforePart.startNode;
        const startNode = container.insertBefore(createMarker(), beforeNode);
        container.insertBefore(createMarker(), beforeNode);
        const newPart = new NodePart(containerPart.options);
        newPart.insertAfterNode(startNode);
        return newPart;
    };
    const updatePart = (part, value) => {
        part.setValue(value);
        part.commit();
        return part;
    };
    const insertPartBefore = (containerPart, part, ref) => {
        const container = containerPart.startNode.parentNode;
        const beforeNode = ref ? ref.startNode : containerPart.endNode;
        const endNode = part.endNode.nextSibling;
        if (endNode !== beforeNode) {
            reparentNodes(container, part.startNode, endNode, beforeNode);
        }
    };
    const removePart = (part) => {
        removeNodes(part.startNode.parentNode, part.startNode, part.endNode.nextSibling);
    };
    // Helper for generating a map of array item to its index over a subset
    // of an array (used to lazily generate `newKeyToIndexMap` and
    // `oldKeyToIndexMap`)
    const generateMap = (list, start, end) => {
        const map = new Map();
        for (let i = start; i <= end; i++) {
            map.set(list[i], i);
        }
        return map;
    };
    // Stores previous ordered list of parts and map of key to index
    const partListCache = new WeakMap();
    const keyListCache = new WeakMap();
    /**
     * A directive that repeats a series of values (usually `TemplateResults`)
     * generated from an iterable, and updates those items efficiently when the
     * iterable changes based on user-provided `keys` associated with each item.
     *
     * Note that if a `keyFn` is provided, strict key-to-DOM mapping is maintained,
     * meaning previous DOM for a given key is moved into the new position if
     * needed, and DOM will never be reused with values for different keys (new DOM
     * will always be created for new keys). This is generally the most efficient
     * way to use `repeat` since it performs minimum unnecessary work for insertions
     * amd removals.
     *
     * IMPORTANT: If providing a `keyFn`, keys *must* be unique for all items in a
     * given call to `repeat`. The behavior when two or more items have the same key
     * is undefined.
     *
     * If no `keyFn` is provided, this directive will perform similar to mapping
     * items to values, and DOM will be reused against potentially different items.
     */
    const repeat = directive((items, keyFnOrTemplate, template) => {
        let keyFn;
        if (template === undefined) {
            template = keyFnOrTemplate;
        }
        else if (keyFnOrTemplate !== undefined) {
            keyFn = keyFnOrTemplate;
        }
        return (containerPart) => {
            if (!(containerPart instanceof NodePart)) {
                throw new Error('repeat can only be used in text bindings');
            }
            // Old part & key lists are retrieved from the last update
            // (associated with the part for this instance of the directive)
            const oldParts = partListCache.get(containerPart) || [];
            const oldKeys = keyListCache.get(containerPart) || [];
            // New part list will be built up as we go (either reused from
            // old parts or created for new keys in this update). This is
            // saved in the above cache at the end of the update.
            const newParts = [];
            // New value list is eagerly generated from items along with a
            // parallel array indicating its key.
            const newValues = [];
            const newKeys = [];
            let index = 0;
            for (const item of items) {
                newKeys[index] = keyFn ? keyFn(item, index) : index;
                newValues[index] = template(item, index);
                index++;
            }
            // Maps from key to index for current and previous update; these
            // are generated lazily only when needed as a performance
            // optimization, since they are only required for multiple
            // non-contiguous changes in the list, which are less common.
            let newKeyToIndexMap;
            let oldKeyToIndexMap;
            // Head and tail pointers to old parts and new values
            let oldHead = 0;
            let oldTail = oldParts.length - 1;
            let newHead = 0;
            let newTail = newValues.length - 1;
            // Overview of O(n) reconciliation algorithm (general approach
            // based on ideas found in ivi, vue, snabbdom, etc.):
            //
            // * We start with the list of old parts and new values (and
            // arrays of
            //   their respective keys), head/tail pointers into each, and
            //   we build up the new list of parts by updating (and when
            //   needed, moving) old parts or creating new ones. The initial
            //   scenario might look like this (for brevity of the diagrams,
            //   the numbers in the array reflect keys associated with the
            //   old parts or new values, although keys and parts/values are
            //   actually stored in parallel arrays indexed using the same
            //   head/tail pointers):
            //
            //      oldHead v                 v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [ ,  ,  ,  ,  ,  ,  ]
            //   newKeys:  [0, 2, 1, 4, 3, 7, 6] <- reflects the user's new
            //   item order
            //      newHead ^                 ^ newTail
            //
            // * Iterate old & new lists from both sides, updating,
            // swapping, or
            //   removing parts at the head/tail locations until neither
            //   head nor tail can move.
            //
            // * Example below: keys at head pointers match, so update old
            // part 0 in-
            //   place (no need to move it) and record part 0 in the
            //   `newParts` list. The last thing we do is advance the
            //   `oldHead` and `newHead` pointers (will be reflected in the
            //   next diagram).
            //
            //      oldHead v                 v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [0,  ,  ,  ,  ,  ,  ] <- heads matched: update 0
            //   and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance both oldHead
            //   & newHead
            //      newHead ^                 ^ newTail
            //
            // * Example below: head pointers don't match, but tail pointers
            // do, so
            //   update part 6 in place (no need to move it), and record
            //   part 6 in the `newParts` list. Last, advance the `oldTail`
            //   and `oldHead` pointers.
            //
            //         oldHead v              v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [0,  ,  ,  ,  ,  , 6] <- tails matched: update 6
            //   and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance both oldTail
            //   & newTail
            //         newHead ^              ^ newTail
            //
            // * If neither head nor tail match; next check if one of the
            // old head/tail
            //   items was removed. We first need to generate the reverse
            //   map of new keys to index (`newKeyToIndexMap`), which is
            //   done once lazily as a performance optimization, since we
            //   only hit this case if multiple non-contiguous changes were
            //   made. Note that for contiguous removal anywhere in the
            //   list, the head and tails would advance from either end and
            //   pass each other before we get to this case and removals
            //   would be handled in the final while loop without needing to
            //   generate the map.
            //
            // * Example below: The key at `oldTail` was removed (no longer
            // in the
            //   `newKeyToIndexMap`), so remove that part from the DOM and
            //   advance just the `oldTail` pointer.
            //
            //         oldHead v           v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [0,  ,  ,  ,  ,  , 6] <- 5 not in new map; remove
            //   5 and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance oldTail
            //         newHead ^           ^ newTail
            //
            // * Once head and tail cannot move, any mismatches are due to
            // either new or
            //   moved items; if a new key is in the previous "old key to
            //   old index" map, move the old part to the new location,
            //   otherwise create and insert a new part. Note that when
            //   moving an old part we null its position in the oldParts
            //   array if it lies between the head and tail so we know to
            //   skip it when the pointers get there.
            //
            // * Example below: neither head nor tail match, and neither
            // were removed;
            //   so find the `newHead` key in the `oldKeyToIndexMap`, and
            //   move that old part's DOM into the next head position
            //   (before `oldParts[oldHead]`). Last, null the part in the
            //   `oldPart` array since it was somewhere in the remaining
            //   oldParts still to be scanned (between the head and tail
            //   pointers) so that we know to skip that old part on future
            //   iterations.
            //
            //         oldHead v        v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2,  ,  ,  ,  , 6] <- stuck; update & move 2
            //   into place newKeys:  [0, 2, 1, 4, 3, 7, 6]    and advance
            //   newHead
            //         newHead ^           ^ newTail
            //
            // * Note that for moves/insertions like the one above, a part
            // inserted at
            //   the head pointer is inserted before the current
            //   `oldParts[oldHead]`, and a part inserted at the tail
            //   pointer is inserted before `newParts[newTail+1]`. The
            //   seeming asymmetry lies in the fact that new parts are moved
            //   into place outside in, so to the right of the head pointer
            //   are old parts, and to the right of the tail pointer are new
            //   parts.
            //
            // * We always restart back from the top of the algorithm,
            // allowing matching
            //   and simple updates in place to continue...
            //
            // * Example below: the head pointers once again match, so
            // simply update
            //   part 1 and record it in the `newParts` array.  Last,
            //   advance both head pointers.
            //
            //         oldHead v        v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1,  ,  ,  , 6] <- heads matched; update 1
            //   and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance both oldHead
            //   & newHead
            //            newHead ^        ^ newTail
            //
            // * As mentioned above, items that were moved as a result of
            // being stuck
            //   (the final else clause in the code below) are marked with
            //   null, so we always advance old pointers over these so we're
            //   comparing the next actual old value on either end.
            //
            // * Example below: `oldHead` is null (already placed in
            // newParts), so
            //   advance `oldHead`.
            //
            //            oldHead v     v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6] // old head already used;
            //   advance newParts: [0, 2, 1,  ,  ,  , 6] // oldHead newKeys:
            //   [0, 2, 1, 4, 3, 7, 6]
            //               newHead ^     ^ newTail
            //
            // * Note it's not critical to mark old parts as null when they
            // are moved
            //   from head to tail or tail to head, since they will be
            //   outside the pointer range and never visited again.
            //
            // * Example below: Here the old tail key matches the new head
            // key, so
            //   the part at the `oldTail` position and move its DOM to the
            //   new head position (before `oldParts[oldHead]`). Last,
            //   advance `oldTail` and `newHead` pointers.
            //
            //               oldHead v  v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1, 4,  ,  , 6] <- old tail matches new
            //   head: update newKeys:  [0, 2, 1, 4, 3, 7, 6]   & move 4,
            //   advance oldTail & newHead
            //               newHead ^     ^ newTail
            //
            // * Example below: Old and new head keys match, so update the
            // old head
            //   part in place, and advance the `oldHead` and `newHead`
            //   pointers.
            //
            //               oldHead v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1, 4, 3,   ,6] <- heads match: update 3
            //   and advance newKeys:  [0, 2, 1, 4, 3, 7, 6]    oldHead &
            //   newHead
            //                  newHead ^  ^ newTail
            //
            // * Once the new or old pointers move past each other then all
            // we have
            //   left is additions (if old list exhausted) or removals (if
            //   new list exhausted). Those are handled in the final while
            //   loops at the end.
            //
            // * Example below: `oldHead` exceeded `oldTail`, so we're done
            // with the
            //   main loop.  Create the remaining part and insert it at the
            //   new head position, and the update is complete.
            //
            //                   (oldHead > oldTail)
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1, 4, 3, 7 ,6] <- create and insert 7
            //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
            //                     newHead ^ newTail
            //
            // * Note that the order of the if/else clauses is not important
            // to the
            //   algorithm, as long as the null checks come first (to ensure
            //   we're always working on valid old parts) and that the final
            //   else clause comes last (since that's where the expensive
            //   moves occur). The order of remaining clauses is is just a
            //   simple guess at which cases will be most common.
            //
            // * TODO(kschaaf) Note, we could calculate the longest
            // increasing
            //   subsequence (LIS) of old items in new position, and only
            //   move those not in the LIS set. However that costs O(nlogn)
            //   time and adds a bit more code, and only helps make rare
            //   types of mutations require fewer moves. The above handles
            //   removes, adds, reversal, swaps, and single moves of
            //   contiguous items in linear time, in the minimum number of
            //   moves. As the number of multiple moves where LIS might help
            //   approaches a random shuffle, the LIS optimization becomes
            //   less helpful, so it seems not worth the code at this point.
            //   Could reconsider if a compelling case arises.
            while (oldHead <= oldTail && newHead <= newTail) {
                if (oldParts[oldHead] === null) {
                    // `null` means old part at head has already been used
                    // below; skip
                    oldHead++;
                }
                else if (oldParts[oldTail] === null) {
                    // `null` means old part at tail has already been used
                    // below; skip
                    oldTail--;
                }
                else if (oldKeys[oldHead] === newKeys[newHead]) {
                    // Old head matches new head; update in place
                    newParts[newHead] =
                        updatePart(oldParts[oldHead], newValues[newHead]);
                    oldHead++;
                    newHead++;
                }
                else if (oldKeys[oldTail] === newKeys[newTail]) {
                    // Old tail matches new tail; update in place
                    newParts[newTail] =
                        updatePart(oldParts[oldTail], newValues[newTail]);
                    oldTail--;
                    newTail--;
                }
                else if (oldKeys[oldHead] === newKeys[newTail]) {
                    // Old head matches new tail; update and move to new tail
                    newParts[newTail] =
                        updatePart(oldParts[oldHead], newValues[newTail]);
                    insertPartBefore(containerPart, oldParts[oldHead], newParts[newTail + 1]);
                    oldHead++;
                    newTail--;
                }
                else if (oldKeys[oldTail] === newKeys[newHead]) {
                    // Old tail matches new head; update and move to new head
                    newParts[newHead] =
                        updatePart(oldParts[oldTail], newValues[newHead]);
                    insertPartBefore(containerPart, oldParts[oldTail], oldParts[oldHead]);
                    oldTail--;
                    newHead++;
                }
                else {
                    if (newKeyToIndexMap === undefined) {
                        // Lazily generate key-to-index maps, used for removals &
                        // moves below
                        newKeyToIndexMap = generateMap(newKeys, newHead, newTail);
                        oldKeyToIndexMap = generateMap(oldKeys, oldHead, oldTail);
                    }
                    if (!newKeyToIndexMap.has(oldKeys[oldHead])) {
                        // Old head is no longer in new list; remove
                        removePart(oldParts[oldHead]);
                        oldHead++;
                    }
                    else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
                        // Old tail is no longer in new list; remove
                        removePart(oldParts[oldTail]);
                        oldTail--;
                    }
                    else {
                        // Any mismatches at this point are due to additions or
                        // moves; see if we have an old part we can reuse and move
                        // into place
                        const oldIndex = oldKeyToIndexMap.get(newKeys[newHead]);
                        const oldPart = oldIndex !== undefined ? oldParts[oldIndex] : null;
                        if (oldPart === null) {
                            // No old part for this value; create a new one and
                            // insert it
                            const newPart = createAndInsertPart(containerPart, oldParts[oldHead]);
                            updatePart(newPart, newValues[newHead]);
                            newParts[newHead] = newPart;
                        }
                        else {
                            // Reuse old part
                            newParts[newHead] =
                                updatePart(oldPart, newValues[newHead]);
                            insertPartBefore(containerPart, oldPart, oldParts[oldHead]);
                            // This marks the old part as having been used, so that
                            // it will be skipped in the first two checks above
                            oldParts[oldIndex] = null;
                        }
                        newHead++;
                    }
                }
            }
            // Add parts for any remaining new values
            while (newHead <= newTail) {
                // For all remaining additions, we insert before last new
                // tail, since old pointers are no longer valid
                const newPart = createAndInsertPart(containerPart, newParts[newTail + 1]);
                updatePart(newPart, newValues[newHead]);
                newParts[newHead++] = newPart;
            }
            // Remove any remaining unused old parts
            while (oldHead <= oldTail) {
                const oldPart = oldParts[oldHead++];
                if (oldPart !== null) {
                    removePart(oldPart);
                }
            }
            // Save order of new parts for next round
            partListCache.set(containerPart, newParts);
            keyListCache.set(containerPart, newKeys);
        };
    });

    const cssStr$4 = css`
${cssStr}
${cssStr$1}

:host {
  display: block;
  padding-right: 10px;
}

beaker-post {
  border-top: 1px solid #dde;
  padding: 16px 10px;
  margin: 0;
}
`;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // For each part, remember the value that was last rendered to the part by the
    // unsafeHTML directive, and the DocumentFragment that was last set as a value.
    // The DocumentFragment is used as a unique key to check if the last value
    // rendered to the part was with unsafeHTML. If not, we'll always re-render the
    // value passed to unsafeHTML.
    const previousValues = new WeakMap();
    /**
     * Renders the result as HTML, rather than text.
     *
     * Note, this is unsafe to use with any user-provided input that hasn't been
     * sanitized or escaped, as it may lead to cross-site-scripting
     * vulnerabilities.
     */
    const unsafeHTML = directive((value) => (part) => {
        if (!(part instanceof NodePart)) {
            throw new Error('unsafeHTML can only be used in text bindings');
        }
        const previousValue = previousValues.get(part);
        if (previousValue !== undefined && isPrimitive(value) &&
            value === previousValue.value && part.value === previousValue.fragment) {
            return;
        }
        const template = document.createElement('template');
        template.innerHTML = value; // innerHTML casts to string internally
        const fragment = document.importNode(template.content, true);
        part.setValue(fragment);
        previousValues.set(part, { value, fragment });
    });

    const cssStr$5 = css`
body {
  /* common simple colors */
  --red: rgb(255, 59, 48);
  --orange: rgb(255, 149, 0);
  --yellow: rgb(255, 204, 0);
  --lime: #E6EE9C;
  --green: rgb(51, 167, 71);
  --teal: rgb(90, 200, 250);
  --blue: #2864dc;
  --purple: rgb(88, 86, 214);
  --pink: rgb(255, 45, 85);

  /* common element colors */
  --color-text: #333;
  --color-text--muted: gray;
  --color-text--light: #aaa;
  --color-text--dark: #111;
  --color-link: #295fcb;
  --color-focus-box-shadow: rgba(41, 95, 203, 0.8);
  --border-color: #d4d7dc;
  --light-border-color: #e4e7ec;
}
`;

    const cssStr$6 = css`
${cssStr$5}

button {
  background: #fff;
  border: 1px solid #ccd;
  border-radius: 3px;
  box-shadow: 0 1px 1px rgba(0,0,0,.05);
  padding: 5px 10px;
  color: #333;
  outline: 0;
  cursor: pointer;
}

button:hover {
  background: #f5f5f5;
}

button:active {
  background: #eee;
}

button.big {
  padding: 6px 12px;
}

button.block {
  display: block;
  width: 100%;
}

button.pressed {
  box-shadow: inset 0 1px 1px rgba(0,0,0,.5);
  background: #6d6d79;
  color: rgba(255,255,255,1);
  border-color: transparent;
  border-radius: 4px;
}

button.primary {
  background: #5289f7;
  border-color: var(--blue);
  color: #fff;
  box-shadow: 0 1px 1px rgba(0,0,0,.1);
}

button.primary:hover {
  background: rgb(73, 126, 234);
}

button.gray {
  background: #fafafa;
}

button.gray:hover {
  background: #f5f5f5;
}

button[disabled] {
  border-color: var(--border-color);
  background: #fff;
  color: #999;
  cursor: default;
}

button.rounded {
  border-radius: 16px;
}

button.flat {
  box-shadow: none; 
}

button.noborder {
  border-color: transparent;
}

button.transparent {
  background: transparent;
  border-color: transparent;
  box-shadow: none; 
}

button.transparent:hover {
  background: #f5f5fa;
}

button.transparent.pressed {
  background: rgba(0,0,0,.1);
  box-shadow: inset 0 1px 2px rgba(0,0,0,.25);
  color: inherit;
}

.radio-group button {
  background: transparent;
  border: 0;
  box-shadow: none;
}

.radio-group button.pressed {
  background: #6d6d79;
  border-radius: 30px;
}

.btn-group {
  display: inline-flex;
}

.btn-group button {
  border-radius: 0;
  border-right-width: 0;
}

.btn-group button:first-child {
  border-top-left-radius: 3px;
  border-bottom-left-radius: 3px;
}

.btn-group button:last-child {
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;
  border-right-width: 1px;
}

.btn-group.rounded button:first-child {
  border-top-left-radius: 14px;
  border-bottom-left-radius: 14px;
  padding-left: 14px;
}

.btn-group.rounded button:last-child {
  border-top-right-radius: 14px;
  border-bottom-right-radius: 14px;
  padding-right: 14px;
}
`;

    const cssStr$7 = css`
.votectrl {
  position: relative;
  top: 0;
}

.votectrl > * {
  display: block;
  line-height: 0.8;
  color: #bbc;
}

.votectrl .karma,
.votectrl .fas {
  width: 30px;
  text-align: center;
}

.votectrl .karma {
  color: #889;
  font-weight: 600;
}

.votectrl .fas {
  font-size: 16px;
  cursor: pointer;
}

.votectrl .upvoted,
.votectrl .upvote:hover,
.votectrl .upvote.selected {
  color: var(--red);
}

.votectrl .downvoted,
.votectrl .downvote:hover,
.votectrl .downvote.selected {
  color: var(--red);
}
`;

    const cssStr$8 = css`
${cssStr$6}
${cssStr$2}
${cssStr$7}

:host {
  display: grid;
  grid-template-columns: 40px 1fr;
  align-items: center;
  letter-spacing: 0.5px;
  font-size: 14px;
  margin-bottom: 10px;
}

:host([expanded]) {
  align-items: flex-start;
  font-size: 16px;
}

a {
  text-decoration: none;
  color: #667;
  cursor: pointer;
}

a:hover {
  text-decoration: underline;
}

:host([expanded]) .votectrl .fas {
  font-size: 20px;
}
:host([expanded]) .votectrl .karma {
  font-size: 18px;
}

.title {
  font-size: 17px;
  font-weight: bold;
  color: var(--blue);
}

:host([expanded]) .title {
  font-size: 22px;
}

.drive-type,
.domain {
  color: #778;
}

.drive-type .far,
.drive-type .fas,
.domain .far,
.domain .fas {
  position: relative;
  top: -1px;
  font-size: 10px;
}

button.menu {
  padding: 0;
}

.topic {
  font-weight: bold;
  color: #445;
}

.text-post-content {
  border: 1px solid #ccd;
  border-radius: 4px;
  padding: 14px;
  margin: 10px 0 0;
}

.text-post-content > :first-child {
  margin-top: 0;
}

.text-post-content > :last-child {
  margin-bottom: 0;
}

.text-post-content a {
  color: var(--blue);
}

.file-content {
  border: 1px solid #ccd;
  border-radius: 4px;
  padding: 14px;
  margin: 10px 0 0;
}

.file-content h3 {
  margin: 0;
}

.file-content h3 + * {
  margin-top: 10px;
}

.file-content > * {
  max-width: 100%;
}
`;

    const yearFormatter = new Intl.DateTimeFormat('en-US', {year: 'numeric'});
    const CURRENT_YEAR = yearFormatter.format(new Date());

    // simple timediff fn
    // replace this with Intl.RelativeTimeFormat when it lands in Beaker
    // https://stackoverflow.com/questions/6108819/javascript-timestamp-to-relative-time-eg-2-seconds-ago-one-week-ago-etc-best
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;
    const msPerMonth = msPerDay * 30;
    const msPerYear = msPerDay * 365;
    const now = Date.now();
    function timeDifference (ts, short = false, postfix = 'ago') {
      ts = Number(new Date(ts));
      var elapsed = now - ts;
      if (elapsed < 1) elapsed = 1; // let's avoid 0 and negative values
      if (elapsed < msPerMinute) {
        let n = Math.round(elapsed/1000);
        return `${n}${short ? 's' : pluralize(n, ' second')} ${postfix}`
      } else if (elapsed < msPerHour) {
        let n = Math.round(elapsed/msPerMinute);
        return `${n}${short ? 'm' : pluralize(n, ' minute')} ${postfix}`
      } else if (elapsed < msPerDay) {
        let n = Math.round(elapsed/msPerHour);
        return `${n}${short ? 'h' : pluralize(n, ' hour')} ${postfix}`
      } else if (elapsed < msPerMonth) {
        let n = Math.round(elapsed/msPerDay);
        return `${n}${short ? 'd' : pluralize(n, ' day')} ${postfix}`
      } else if (elapsed < msPerYear) {
        let n = Math.round(elapsed/msPerMonth);
        return `${n}${short ? 'mo' : pluralize(n, ' month')} ${postfix}`
      } else {
        let n = Math.round(elapsed/msPerYear);
        return `${n}${short ? 'yr' : pluralize(n, ' year')} ${postfix}`
      }
    }

    function findParent (node, test) {
      if (typeof test === 'string') {
        // classname default
        var cls = test;
        test = el => el.classList && el.classList.contains(cls);
      }

      while (node) {
        if (test(node)) {
          return node
        }
        node = node.parentNode;
      }
    }

    function emit (el, evt, opts = {}) {
      opts.bubbles = ('bubbles' in opts) ? opts.bubbles : true;
      opts.composed = ('composed' in opts) ? opts.composed : true;
      el.dispatchEvent(new CustomEvent(evt, opts));
    }

    /*!
     * Dynamically changing favicons with JavaScript
     * Works in all A-grade browsers except Safari and Internet Explorer
     * Demo: http://mathiasbynens.be/demo/dynamic-favicons
     */

    var _head = document.head || document.getElementsByTagName('head')[0]; // https://stackoverflow.com/a/2995536

    function writeToClipboard (str) {
      var textarea = document.createElement('textarea');
      textarea.textContent = str;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    /*! markdown-it 10.0.0 https://github.com//markdown-it/markdown-it @license MIT */
    const define = (function(){return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t);}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
      
      /*eslint quotes:0*/
      module.exports = require('entities/lib/maps/entities.json');
      
      },{"entities/lib/maps/entities.json":52}],2:[function(require,module,exports){
      
      
      module.exports = [
        'address',
        'article',
        'aside',
        'base',
        'basefont',
        'blockquote',
        'body',
        'caption',
        'center',
        'col',
        'colgroup',
        'dd',
        'details',
        'dialog',
        'dir',
        'div',
        'dl',
        'dt',
        'fieldset',
        'figcaption',
        'figure',
        'footer',
        'form',
        'frame',
        'frameset',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'head',
        'header',
        'hr',
        'html',
        'iframe',
        'legend',
        'li',
        'link',
        'main',
        'menu',
        'menuitem',
        'meta',
        'nav',
        'noframes',
        'ol',
        'optgroup',
        'option',
        'p',
        'param',
        'section',
        'source',
        'summary',
        'table',
        'tbody',
        'td',
        'tfoot',
        'th',
        'thead',
        'title',
        'tr',
        'track',
        'ul'
      ];
      
      },{}],3:[function(require,module,exports){
      
      var attr_name     = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
      
      var unquoted      = '[^"\'=<>`\\x00-\\x20]+';
      var single_quoted = "'[^']*'";
      var double_quoted = '"[^"]*"';
      
      var attr_value  = '(?:' + unquoted + '|' + single_quoted + '|' + double_quoted + ')';
      
      var attribute   = '(?:\\s+' + attr_name + '(?:\\s*=\\s*' + attr_value + ')?)';
      
      var open_tag    = '<[A-Za-z][A-Za-z0-9\\-]*' + attribute + '*\\s*\\/?>';
      
      var close_tag   = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>';
      var comment     = '<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->';
      var processing  = '<[?].*?[?]>';
      var declaration = '<![A-Z]+\\s+[^>]*>';
      var cdata       = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';
      
      var HTML_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + '|' + comment +
                              '|' + processing + '|' + declaration + '|' + cdata + ')');
      var HTML_OPEN_CLOSE_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + ')');
      
      module.exports.HTML_TAG_RE = HTML_TAG_RE;
      module.exports.HTML_OPEN_CLOSE_TAG_RE = HTML_OPEN_CLOSE_TAG_RE;
      
      },{}],4:[function(require,module,exports){
      
      
      function _class(obj) { return Object.prototype.toString.call(obj); }
      
      function isString(obj) { return _class(obj) === '[object String]'; }
      
      var _hasOwnProperty = Object.prototype.hasOwnProperty;
      
      function has(object, key) {
        return _hasOwnProperty.call(object, key);
      }
      
      // Merge objects
      //
      function assign(obj /*from1, from2, from3, ...*/) {
        var sources = Array.prototype.slice.call(arguments, 1);
      
        sources.forEach(function (source) {
          if (!source) { return; }
      
          if (typeof source !== 'object') {
            throw new TypeError(source + 'must be object');
          }
      
          Object.keys(source).forEach(function (key) {
            obj[key] = source[key];
          });
        });
      
        return obj;
      }
      
      // Remove element from array and put another array at those position.
      // Useful for some operations with tokens
      function arrayReplaceAt(src, pos, newElements) {
        return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      function isValidEntityCode(c) {
        /*eslint no-bitwise:0*/
        // broken sequence
        if (c >= 0xD800 && c <= 0xDFFF) { return false; }
        // never used
        if (c >= 0xFDD0 && c <= 0xFDEF) { return false; }
        if ((c & 0xFFFF) === 0xFFFF || (c & 0xFFFF) === 0xFFFE) { return false; }
        // control codes
        if (c >= 0x00 && c <= 0x08) { return false; }
        if (c === 0x0B) { return false; }
        if (c >= 0x0E && c <= 0x1F) { return false; }
        if (c >= 0x7F && c <= 0x9F) { return false; }
        // out of range
        if (c > 0x10FFFF) { return false; }
        return true;
      }
      
      function fromCodePoint(c) {
        /*eslint no-bitwise:0*/
        if (c > 0xffff) {
          c -= 0x10000;
          var surrogate1 = 0xd800 + (c >> 10),
              surrogate2 = 0xdc00 + (c & 0x3ff);
      
          return String.fromCharCode(surrogate1, surrogate2);
        }
        return String.fromCharCode(c);
      }
      
      
      var UNESCAPE_MD_RE  = /\\([!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~])/g;
      var ENTITY_RE       = /&([a-z#][a-z0-9]{1,31});/gi;
      var UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + '|' + ENTITY_RE.source, 'gi');
      
      var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))/i;
      
      var entities = require('./entities');
      
      function replaceEntityPattern(match, name) {
        var code = 0;
      
        if (has(entities, name)) {
          return entities[name];
        }
      
        if (name.charCodeAt(0) === 0x23/* # */ && DIGITAL_ENTITY_TEST_RE.test(name)) {
          code = name[1].toLowerCase() === 'x' ?
            parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      
          if (isValidEntityCode(code)) {
            return fromCodePoint(code);
          }
        }
      
        return match;
      }
      
      /*function replaceEntities(str) {
        if (str.indexOf('&') < 0) { return str; }
      
        return str.replace(ENTITY_RE, replaceEntityPattern);
      }*/
      
      function unescapeMd(str) {
        if (str.indexOf('\\') < 0) { return str; }
        return str.replace(UNESCAPE_MD_RE, '$1');
      }
      
      function unescapeAll(str) {
        if (str.indexOf('\\') < 0 && str.indexOf('&') < 0) { return str; }
      
        return str.replace(UNESCAPE_ALL_RE, function (match, escaped, entity) {
          if (escaped) { return escaped; }
          return replaceEntityPattern(match, entity);
        });
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      var HTML_ESCAPE_TEST_RE = /[&<>"]/;
      var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
      var HTML_REPLACEMENTS = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
      };
      
      function replaceUnsafeChar(ch) {
        return HTML_REPLACEMENTS[ch];
      }
      
      function escapeHtml(str) {
        if (HTML_ESCAPE_TEST_RE.test(str)) {
          return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
        }
        return str;
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
      
      function escapeRE(str) {
        return str.replace(REGEXP_ESCAPE_RE, '\\$&');
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      function isSpace(code) {
        switch (code) {
          case 0x09:
          case 0x20:
            return true;
        }
        return false;
      }
      
      // Zs (unicode class) || [\t\f\v\r\n]
      function isWhiteSpace(code) {
        if (code >= 0x2000 && code <= 0x200A) { return true; }
        switch (code) {
          case 0x09: // \t
          case 0x0A: // \n
          case 0x0B: // \v
          case 0x0C: // \f
          case 0x0D: // \r
          case 0x20:
          case 0xA0:
          case 0x1680:
          case 0x202F:
          case 0x205F:
          case 0x3000:
            return true;
        }
        return false;
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      /*eslint-disable max-len*/
      var UNICODE_PUNCT_RE = require('uc.micro/categories/P/regex');
      
      // Currently without astral characters support.
      function isPunctChar(ch) {
        return UNICODE_PUNCT_RE.test(ch);
      }
      
      
      // Markdown ASCII punctuation characters.
      //
      // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
      // http://spec.commonmark.org/0.15/#ascii-punctuation-character
      //
      // Don't confuse with unicode punctuation !!! It lacks some chars in ascii range.
      //
      function isMdAsciiPunct(ch) {
        switch (ch) {
          case 0x21/* ! */:
          case 0x22/* " */:
          case 0x23/* # */:
          case 0x24/* $ */:
          case 0x25/* % */:
          case 0x26/* & */:
          case 0x27/* ' */:
          case 0x28/* ( */:
          case 0x29/* ) */:
          case 0x2A/* * */:
          case 0x2B/* + */:
          case 0x2C/* , */:
          case 0x2D/* - */:
          case 0x2E/* . */:
          case 0x2F/* / */:
          case 0x3A/* : */:
          case 0x3B/* ; */:
          case 0x3C/* < */:
          case 0x3D/* = */:
          case 0x3E/* > */:
          case 0x3F/* ? */:
          case 0x40/* @ */:
          case 0x5B/* [ */:
          case 0x5C/* \ */:
          case 0x5D/* ] */:
          case 0x5E/* ^ */:
          case 0x5F/* _ */:
          case 0x60/* ` */:
          case 0x7B/* { */:
          case 0x7C/* | */:
          case 0x7D/* } */:
          case 0x7E/* ~ */:
            return true;
          default:
            return false;
        }
      }
      
      // Hepler to unify [reference labels].
      //
      function normalizeReference(str) {
        // Trim and collapse whitespace
        //
        str = str.trim().replace(/\s+/g, ' ');
      
        // In node v10 'ẞ'.toLowerCase() === 'Ṿ', which is presumed to be a bug
        // fixed in v12 (couldn't find any details).
        //
        // So treat this one as a special case
        // (remove this when node v10 is no longer supported).
        //
        if ('ẞ'.toLowerCase() === 'Ṿ') {
          str = str.replace(/ẞ/g, 'ß');
        }
      
        // .toLowerCase().toUpperCase() should get rid of all differences
        // between letter variants.
        //
        // Simple .toLowerCase() doesn't normalize 125 code points correctly,
        // and .toUpperCase doesn't normalize 6 of them (list of exceptions:
        // İ, ϴ, ẞ, Ω, K, Å - those are already uppercased, but have differently
        // uppercased versions).
        //
        // Here's an example showing how it happens. Lets take greek letter omega:
        // uppercase U+0398 (Θ), U+03f4 (ϴ) and lowercase U+03b8 (θ), U+03d1 (ϑ)
        //
        // Unicode entries:
        // 0398;GREEK CAPITAL LETTER THETA;Lu;0;L;;;;;N;;;;03B8;
        // 03B8;GREEK SMALL LETTER THETA;Ll;0;L;;;;;N;;;0398;;0398
        // 03D1;GREEK THETA SYMBOL;Ll;0;L;<compat> 03B8;;;;N;GREEK SMALL LETTER SCRIPT THETA;;0398;;0398
        // 03F4;GREEK CAPITAL THETA SYMBOL;Lu;0;L;<compat> 0398;;;;N;;;;03B8;
        //
        // Case-insensitive comparison should treat all of them as equivalent.
        //
        // But .toLowerCase() doesn't change ϑ (it's already lowercase),
        // and .toUpperCase() doesn't change ϴ (already uppercase).
        //
        // Applying first lower then upper case normalizes any character:
        // '\u0398\u03f4\u03b8\u03d1'.toLowerCase().toUpperCase() === '\u0398\u0398\u0398\u0398'
        //
        // Note: this is equivalent to unicode case folding; unicode normalization
        // is a different step that is not required here.
        //
        // Final result should be uppercased, because it's later stored in an object
        // (this avoid a conflict with Object.prototype members,
        // most notably, `__proto__`)
        //
        return str.toLowerCase().toUpperCase();
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      // Re-export libraries commonly used in both markdown-it and its plugins,
      // so plugins won't have to depend on them explicitly, which reduces their
      // bundled size (e.g. a browser build).
      //
      exports.lib                 = {};
      exports.lib.mdurl           = require('mdurl');
      exports.lib.ucmicro         = require('uc.micro');
      
      exports.assign              = assign;
      exports.isString            = isString;
      exports.has                 = has;
      exports.unescapeMd          = unescapeMd;
      exports.unescapeAll         = unescapeAll;
      exports.isValidEntityCode   = isValidEntityCode;
      exports.fromCodePoint       = fromCodePoint;
      // exports.replaceEntities     = replaceEntities;
      exports.escapeHtml          = escapeHtml;
      exports.arrayReplaceAt      = arrayReplaceAt;
      exports.isSpace             = isSpace;
      exports.isWhiteSpace        = isWhiteSpace;
      exports.isMdAsciiPunct      = isMdAsciiPunct;
      exports.isPunctChar         = isPunctChar;
      exports.escapeRE            = escapeRE;
      exports.normalizeReference  = normalizeReference;
      
      },{"./entities":1,"mdurl":58,"uc.micro":65,"uc.micro/categories/P/regex":63}],5:[function(require,module,exports){
      
      
      exports.parseLinkLabel       = require('./parse_link_label');
      exports.parseLinkDestination = require('./parse_link_destination');
      exports.parseLinkTitle       = require('./parse_link_title');
      
      },{"./parse_link_destination":6,"./parse_link_label":7,"./parse_link_title":8}],6:[function(require,module,exports){
      
      
      var unescapeAll = require('../common/utils').unescapeAll;
      
      
      module.exports = function parseLinkDestination(str, pos, max) {
        var code, level,
            lines = 0,
            start = pos,
            result = {
              ok: false,
              pos: 0,
              lines: 0,
              str: ''
            };
      
        if (str.charCodeAt(pos) === 0x3C /* < */) {
          pos++;
          while (pos < max) {
            code = str.charCodeAt(pos);
            if (code === 0x0A /* \n */) { return result; }
            if (code === 0x3E /* > */) {
              result.pos = pos + 1;
              result.str = unescapeAll(str.slice(start + 1, pos));
              result.ok = true;
              return result;
            }
            if (code === 0x5C /* \ */ && pos + 1 < max) {
              pos += 2;
              continue;
            }
      
            pos++;
          }
      
          // no closing '>'
          return result;
        }
      
        // this should be ... } else { ... branch
      
        level = 0;
        while (pos < max) {
          code = str.charCodeAt(pos);
      
          if (code === 0x20) { break; }
      
          // ascii control characters
          if (code < 0x20 || code === 0x7F) { break; }
      
          if (code === 0x5C /* \ */ && pos + 1 < max) {
            pos += 2;
            continue;
          }
      
          if (code === 0x28 /* ( */) {
            level++;
          }
      
          if (code === 0x29 /* ) */) {
            if (level === 0) { break; }
            level--;
          }
      
          pos++;
        }
      
        if (start === pos) { return result; }
        if (level !== 0) { return result; }
      
        result.str = unescapeAll(str.slice(start, pos));
        result.lines = lines;
        result.pos = pos;
        result.ok = true;
        return result;
      };
      
      },{"../common/utils":4}],7:[function(require,module,exports){
      
      module.exports = function parseLinkLabel(state, start, disableNested) {
        var level, found, marker, prevPos,
            labelEnd = -1,
            max = state.posMax,
            oldPos = state.pos;
      
        state.pos = start + 1;
        level = 1;
      
        while (state.pos < max) {
          marker = state.src.charCodeAt(state.pos);
          if (marker === 0x5D /* ] */) {
            level--;
            if (level === 0) {
              found = true;
              break;
            }
          }
      
          prevPos = state.pos;
          state.md.inline.skipToken(state);
          if (marker === 0x5B /* [ */) {
            if (prevPos === state.pos - 1) {
              // increase level if we find text `[`, which is not a part of any token
              level++;
            } else if (disableNested) {
              state.pos = oldPos;
              return -1;
            }
          }
        }
      
        if (found) {
          labelEnd = state.pos;
        }
      
        // restore old state
        state.pos = oldPos;
      
        return labelEnd;
      };
      
      },{}],8:[function(require,module,exports){
      
      
      var unescapeAll = require('../common/utils').unescapeAll;
      
      
      module.exports = function parseLinkTitle(str, pos, max) {
        var code,
            marker,
            lines = 0,
            start = pos,
            result = {
              ok: false,
              pos: 0,
              lines: 0,
              str: ''
            };
      
        if (pos >= max) { return result; }
      
        marker = str.charCodeAt(pos);
      
        if (marker !== 0x22 /* " */ && marker !== 0x27 /* ' */ && marker !== 0x28 /* ( */) { return result; }
      
        pos++;
      
        // if opening marker is "(", switch it to closing marker ")"
        if (marker === 0x28) { marker = 0x29; }
      
        while (pos < max) {
          code = str.charCodeAt(pos);
          if (code === marker) {
            result.pos = pos + 1;
            result.lines = lines;
            result.str = unescapeAll(str.slice(start + 1, pos));
            result.ok = true;
            return result;
          } else if (code === 0x0A) {
            lines++;
          } else if (code === 0x5C /* \ */ && pos + 1 < max) {
            pos++;
            if (str.charCodeAt(pos) === 0x0A) {
              lines++;
            }
          }
      
          pos++;
        }
      
        return result;
      };
      
      },{"../common/utils":4}],9:[function(require,module,exports){
      
      
      var utils        = require('./common/utils');
      var helpers      = require('./helpers');
      var Renderer     = require('./renderer');
      var ParserCore   = require('./parser_core');
      var ParserBlock  = require('./parser_block');
      var ParserInline = require('./parser_inline');
      var LinkifyIt    = require('linkify-it');
      var mdurl        = require('mdurl');
      var punycode     = require('punycode');
      
      
      var config = {
        'default': require('./presets/default'),
        zero: require('./presets/zero'),
        commonmark: require('./presets/commonmark')
      };
      
      ////////////////////////////////////////////////////////////////////////////////
      //
      // This validator can prohibit more than really needed to prevent XSS. It's a
      // tradeoff to keep code simple and to be secure by default.
      //
      // If you need different setup - override validator method as you wish. Or
      // replace it with dummy function and use external sanitizer.
      //
      
      var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
      var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
      
      function validateLink(url) {
        // url should be normalized at this point, and existing entities are decoded
        var str = url.trim().toLowerCase();
      
        return BAD_PROTO_RE.test(str) ? (GOOD_DATA_RE.test(str) ? true : false) : true;
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      
      var RECODE_HOSTNAME_FOR = [ 'http:', 'https:', 'mailto:' ];
      
      function normalizeLink(url) {
        var parsed = mdurl.parse(url, true);
      
        if (parsed.hostname) {
          // Encode hostnames in urls like:
          // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
          //
          // We don't encode unknown schemas, because it's likely that we encode
          // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
          //
          if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
            try {
              parsed.hostname = punycode.toASCII(parsed.hostname);
            } catch (er) { /**/ }
          }
        }
      
        return mdurl.encode(mdurl.format(parsed));
      }
      
      function normalizeLinkText(url) {
        var parsed = mdurl.parse(url, true);
      
        if (parsed.hostname) {
          // Encode hostnames in urls like:
          // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
          //
          // We don't encode unknown schemas, because it's likely that we encode
          // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
          //
          if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
            try {
              parsed.hostname = punycode.toUnicode(parsed.hostname);
            } catch (er) { /**/ }
          }
        }
      
        return mdurl.decode(mdurl.format(parsed));
      }
      
      
      /**
       * class MarkdownIt
       *
       * Main parser/renderer class.
       *
       * ##### Usage
       *
       * ```javascript
       * // node.js, "classic" way:
       * var MarkdownIt = require('markdown-it'),
       *     md = new MarkdownIt();
       * var result = md.render('# markdown-it rulezz!');
       *
       * // node.js, the same, but with sugar:
       * var md = require('markdown-it')();
       * var result = md.render('# markdown-it rulezz!');
       *
       * // browser without AMD, added to "window" on script load
       * // Note, there are no dash.
       * var md = window.markdownit();
       * var result = md.render('# markdown-it rulezz!');
       * ```
       *
       * Single line rendering, without paragraph wrap:
       *
       * ```javascript
       * var md = require('markdown-it')();
       * var result = md.renderInline('__markdown-it__ rulezz!');
       * ```
       **/
      
      /**
       * new MarkdownIt([presetName, options])
       * - presetName (String): optional, `commonmark` / `zero`
       * - options (Object)
       *
       * Creates parser instanse with given config. Can be called without `new`.
       *
       * ##### presetName
       *
       * MarkdownIt provides named presets as a convenience to quickly
       * enable/disable active syntax rules and options for common use cases.
       *
       * - ["commonmark"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/commonmark.js) -
       *   configures parser to strict [CommonMark](http://commonmark.org/) mode.
       * - [default](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/default.js) -
       *   similar to GFM, used when no preset name given. Enables all available rules,
       *   but still without html, typographer & autolinker.
       * - ["zero"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/zero.js) -
       *   all rules disabled. Useful to quickly setup your config via `.enable()`.
       *   For example, when you need only `bold` and `italic` markup and nothing else.
       *
       * ##### options:
       *
       * - __html__ - `false`. Set `true` to enable HTML tags in source. Be careful!
       *   That's not safe! You may need external sanitizer to protect output from XSS.
       *   It's better to extend features via plugins, instead of enabling HTML.
       * - __xhtmlOut__ - `false`. Set `true` to add '/' when closing single tags
       *   (`<br />`). This is needed only for full CommonMark compatibility. In real
       *   world you will need HTML output.
       * - __breaks__ - `false`. Set `true` to convert `\n` in paragraphs into `<br>`.
       * - __langPrefix__ - `language-`. CSS language class prefix for fenced blocks.
       *   Can be useful for external highlighters.
       * - __linkify__ - `false`. Set `true` to autoconvert URL-like text to links.
       * - __typographer__  - `false`. Set `true` to enable [some language-neutral
       *   replacement](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/replacements.js) +
       *   quotes beautification (smartquotes).
       * - __quotes__ - `“”‘’`, String or Array. Double + single quotes replacement
       *   pairs, when typographer enabled and smartquotes on. For example, you can
       *   use `'«»„“'` for Russian, `'„“‚‘'` for German, and
       *   `['«\xA0', '\xA0»', '‹\xA0', '\xA0›']` for French (including nbsp).
       * - __highlight__ - `null`. Highlighter function for fenced code blocks.
       *   Highlighter `function (str, lang)` should return escaped HTML. It can also
       *   return empty string if the source was not changed and should be escaped
       *   externaly. If result starts with <pre... internal wrapper is skipped.
       *
       * ##### Example
       *
       * ```javascript
       * // commonmark mode
       * var md = require('markdown-it')('commonmark');
       *
       * // default mode
       * var md = require('markdown-it')();
       *
       * // enable everything
       * var md = require('markdown-it')({
       *   html: true,
       *   linkify: true,
       *   typographer: true
       * });
       * ```
       *
       * ##### Syntax highlighting
       *
       * ```js
       * var hljs = require('highlight.js') // https://highlightjs.org/
       *
       * var md = require('markdown-it')({
       *   highlight: function (str, lang) {
       *     if (lang && hljs.getLanguage(lang)) {
       *       try {
       *         return hljs.highlight(lang, str, true).value;
       *       } catch (__) {}
       *     }
       *
       *     return ''; // use external default escaping
       *   }
       * });
       * ```
       *
       * Or with full wrapper override (if you need assign class to `<pre>`):
       *
       * ```javascript
       * var hljs = require('highlight.js') // https://highlightjs.org/
       *
       * // Actual default values
       * var md = require('markdown-it')({
       *   highlight: function (str, lang) {
       *     if (lang && hljs.getLanguage(lang)) {
       *       try {
       *         return '<pre class="hljs"><code>' +
       *                hljs.highlight(lang, str, true).value +
       *                '</code></pre>';
       *       } catch (__) {}
       *     }
       *
       *     return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
       *   }
       * });
       * ```
       *
       **/
      function MarkdownIt(presetName, options) {
        if (!(this instanceof MarkdownIt)) {
          return new MarkdownIt(presetName, options);
        }
      
        if (!options) {
          if (!utils.isString(presetName)) {
            options = presetName || {};
            presetName = 'default';
          }
        }
      
        /**
         * MarkdownIt#inline -> ParserInline
         *
         * Instance of [[ParserInline]]. You may need it to add new rules when
         * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
         * [[MarkdownIt.enable]].
         **/
        this.inline = new ParserInline();
      
        /**
         * MarkdownIt#block -> ParserBlock
         *
         * Instance of [[ParserBlock]]. You may need it to add new rules when
         * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
         * [[MarkdownIt.enable]].
         **/
        this.block = new ParserBlock();
      
        /**
         * MarkdownIt#core -> Core
         *
         * Instance of [[Core]] chain executor. You may need it to add new rules when
         * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
         * [[MarkdownIt.enable]].
         **/
        this.core = new ParserCore();
      
        /**
         * MarkdownIt#renderer -> Renderer
         *
         * Instance of [[Renderer]]. Use it to modify output look. Or to add rendering
         * rules for new token types, generated by plugins.
         *
         * ##### Example
         *
         * ```javascript
         * var md = require('markdown-it')();
         *
         * function myToken(tokens, idx, options, env, self) {
         *   //...
         *   return result;
         * };
         *
         * md.renderer.rules['my_token'] = myToken
         * ```
         *
         * See [[Renderer]] docs and [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js).
         **/
        this.renderer = new Renderer();
      
        /**
         * MarkdownIt#linkify -> LinkifyIt
         *
         * [linkify-it](https://github.com/markdown-it/linkify-it) instance.
         * Used by [linkify](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/linkify.js)
         * rule.
         **/
        this.linkify = new LinkifyIt();
      
        /**
         * MarkdownIt#validateLink(url) -> Boolean
         *
         * Link validation function. CommonMark allows too much in links. By default
         * we disable `javascript:`, `vbscript:`, `file:` schemas, and almost all `data:...` schemas
         * except some embedded image types.
         *
         * You can change this behaviour:
         *
         * ```javascript
         * var md = require('markdown-it')();
         * // enable everything
         * md.validateLink = function () { return true; }
         * ```
         **/
        this.validateLink = validateLink;
      
        /**
         * MarkdownIt#normalizeLink(url) -> String
         *
         * Function used to encode link url to a machine-readable format,
         * which includes url-encoding, punycode, etc.
         **/
        this.normalizeLink = normalizeLink;
      
        /**
         * MarkdownIt#normalizeLinkText(url) -> String
         *
         * Function used to decode link url to a human-readable format`
         **/
        this.normalizeLinkText = normalizeLinkText;
      
      
        // Expose utils & helpers for easy acces from plugins
      
        /**
         * MarkdownIt#utils -> utils
         *
         * Assorted utility functions, useful to write plugins. See details
         * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/common/utils.js).
         **/
        this.utils = utils;
      
        /**
         * MarkdownIt#helpers -> helpers
         *
         * Link components parser functions, useful to write plugins. See details
         * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/helpers).
         **/
        this.helpers = utils.assign({}, helpers);
      
      
        this.options = {};
        this.configure(presetName);
      
        if (options) { this.set(options); }
      }
      
      
      /** chainable
       * MarkdownIt.set(options)
       *
       * Set parser options (in the same format as in constructor). Probably, you
       * will never need it, but you can change options after constructor call.
       *
       * ##### Example
       *
       * ```javascript
       * var md = require('markdown-it')()
       *             .set({ html: true, breaks: true })
       *             .set({ typographer, true });
       * ```
       *
       * __Note:__ To achieve the best possible performance, don't modify a
       * `markdown-it` instance options on the fly. If you need multiple configurations
       * it's best to create multiple instances and initialize each with separate
       * config.
       **/
      MarkdownIt.prototype.set = function (options) {
        utils.assign(this.options, options);
        return this;
      };
      
      
      /** chainable, internal
       * MarkdownIt.configure(presets)
       *
       * Batch load of all options and compenent settings. This is internal method,
       * and you probably will not need it. But if you with - see available presets
       * and data structure [here](https://github.com/markdown-it/markdown-it/tree/master/lib/presets)
       *
       * We strongly recommend to use presets instead of direct config loads. That
       * will give better compatibility with next versions.
       **/
      MarkdownIt.prototype.configure = function (presets) {
        var self = this, presetName;
      
        if (utils.isString(presets)) {
          presetName = presets;
          presets = config[presetName];
          if (!presets) { throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name'); }
        }
      
        if (!presets) { throw new Error('Wrong `markdown-it` preset, can\'t be empty'); }
      
        if (presets.options) { self.set(presets.options); }
      
        if (presets.components) {
          Object.keys(presets.components).forEach(function (name) {
            if (presets.components[name].rules) {
              self[name].ruler.enableOnly(presets.components[name].rules);
            }
            if (presets.components[name].rules2) {
              self[name].ruler2.enableOnly(presets.components[name].rules2);
            }
          });
        }
        return this;
      };
      
      
      /** chainable
       * MarkdownIt.enable(list, ignoreInvalid)
       * - list (String|Array): rule name or list of rule names to enable
       * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
       *
       * Enable list or rules. It will automatically find appropriate components,
       * containing rules with given names. If rule not found, and `ignoreInvalid`
       * not set - throws exception.
       *
       * ##### Example
       *
       * ```javascript
       * var md = require('markdown-it')()
       *             .enable(['sub', 'sup'])
       *             .disable('smartquotes');
       * ```
       **/
      MarkdownIt.prototype.enable = function (list, ignoreInvalid) {
        var result = [];
      
        if (!Array.isArray(list)) { list = [ list ]; }
      
        [ 'core', 'block', 'inline' ].forEach(function (chain) {
          result = result.concat(this[chain].ruler.enable(list, true));
        }, this);
      
        result = result.concat(this.inline.ruler2.enable(list, true));
      
        var missed = list.filter(function (name) { return result.indexOf(name) < 0; });
      
        if (missed.length && !ignoreInvalid) {
          throw new Error('MarkdownIt. Failed to enable unknown rule(s): ' + missed);
        }
      
        return this;
      };
      
      
      /** chainable
       * MarkdownIt.disable(list, ignoreInvalid)
       * - list (String|Array): rule name or list of rule names to disable.
       * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
       *
       * The same as [[MarkdownIt.enable]], but turn specified rules off.
       **/
      MarkdownIt.prototype.disable = function (list, ignoreInvalid) {
        var result = [];
      
        if (!Array.isArray(list)) { list = [ list ]; }
      
        [ 'core', 'block', 'inline' ].forEach(function (chain) {
          result = result.concat(this[chain].ruler.disable(list, true));
        }, this);
      
        result = result.concat(this.inline.ruler2.disable(list, true));
      
        var missed = list.filter(function (name) { return result.indexOf(name) < 0; });
      
        if (missed.length && !ignoreInvalid) {
          throw new Error('MarkdownIt. Failed to disable unknown rule(s): ' + missed);
        }
        return this;
      };
      
      
      /** chainable
       * MarkdownIt.use(plugin, params)
       *
       * Load specified plugin with given params into current parser instance.
       * It's just a sugar to call `plugin(md, params)` with curring.
       *
       * ##### Example
       *
       * ```javascript
       * var iterator = require('markdown-it-for-inline');
       * var md = require('markdown-it')()
       *             .use(iterator, 'foo_replace', 'text', function (tokens, idx) {
       *               tokens[idx].content = tokens[idx].content.replace(/foo/g, 'bar');
       *             });
       * ```
       **/
      MarkdownIt.prototype.use = function (plugin /*, params, ... */) {
        var args = [ this ].concat(Array.prototype.slice.call(arguments, 1));
        plugin.apply(plugin, args);
        return this;
      };
      
      
      /** internal
       * MarkdownIt.parse(src, env) -> Array
       * - src (String): source string
       * - env (Object): environment sandbox
       *
       * Parse input string and returns list of block tokens (special token type
       * "inline" will contain list of inline tokens). You should not call this
       * method directly, until you write custom renderer (for example, to produce
       * AST).
       *
       * `env` is used to pass data between "distributed" rules and return additional
       * metadata like reference info, needed for the renderer. It also can be used to
       * inject data in specific cases. Usually, you will be ok to pass `{}`,
       * and then pass updated object to renderer.
       **/
      MarkdownIt.prototype.parse = function (src, env) {
        if (typeof src !== 'string') {
          throw new Error('Input data should be a String');
        }
      
        var state = new this.core.State(src, this, env);
      
        this.core.process(state);
      
        return state.tokens;
      };
      
      
      /**
       * MarkdownIt.render(src [, env]) -> String
       * - src (String): source string
       * - env (Object): environment sandbox
       *
       * Render markdown string into html. It does all magic for you :).
       *
       * `env` can be used to inject additional metadata (`{}` by default).
       * But you will not need it with high probability. See also comment
       * in [[MarkdownIt.parse]].
       **/
      MarkdownIt.prototype.render = function (src, env) {
        env = env || {};
      
        return this.renderer.render(this.parse(src, env), this.options, env);
      };
      
      
      /** internal
       * MarkdownIt.parseInline(src, env) -> Array
       * - src (String): source string
       * - env (Object): environment sandbox
       *
       * The same as [[MarkdownIt.parse]] but skip all block rules. It returns the
       * block tokens list with the single `inline` element, containing parsed inline
       * tokens in `children` property. Also updates `env` object.
       **/
      MarkdownIt.prototype.parseInline = function (src, env) {
        var state = new this.core.State(src, this, env);
      
        state.inlineMode = true;
        this.core.process(state);
      
        return state.tokens;
      };
      
      
      /**
       * MarkdownIt.renderInline(src [, env]) -> String
       * - src (String): source string
       * - env (Object): environment sandbox
       *
       * Similar to [[MarkdownIt.render]] but for single paragraph content. Result
       * will NOT be wrapped into `<p>` tags.
       **/
      MarkdownIt.prototype.renderInline = function (src, env) {
        env = env || {};
      
        return this.renderer.render(this.parseInline(src, env), this.options, env);
      };
      
      
      module.exports = MarkdownIt;
      
      },{"./common/utils":4,"./helpers":5,"./parser_block":10,"./parser_core":11,"./parser_inline":12,"./presets/commonmark":13,"./presets/default":14,"./presets/zero":15,"./renderer":16,"linkify-it":53,"mdurl":58,"punycode":60}],10:[function(require,module,exports){
      
      
      var Ruler           = require('./ruler');
      
      
      var _rules = [
        // First 2 params - rule name & source. Secondary array - list of rules,
        // which can be terminated by this one.
        [ 'table',      require('./rules_block/table'),      [ 'paragraph', 'reference' ] ],
        [ 'code',       require('./rules_block/code') ],
        [ 'fence',      require('./rules_block/fence'),      [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
        [ 'blockquote', require('./rules_block/blockquote'), [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
        [ 'hr',         require('./rules_block/hr'),         [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
        [ 'list',       require('./rules_block/list'),       [ 'paragraph', 'reference', 'blockquote' ] ],
        [ 'reference',  require('./rules_block/reference') ],
        [ 'heading',    require('./rules_block/heading'),    [ 'paragraph', 'reference', 'blockquote' ] ],
        [ 'lheading',   require('./rules_block/lheading') ],
        [ 'html_block', require('./rules_block/html_block'), [ 'paragraph', 'reference', 'blockquote' ] ],
        [ 'paragraph',  require('./rules_block/paragraph') ]
      ];
      
      
      /**
       * new ParserBlock()
       **/
      function ParserBlock() {
        /**
         * ParserBlock#ruler -> Ruler
         *
         * [[Ruler]] instance. Keep configuration of block rules.
         **/
        this.ruler = new Ruler();
      
        for (var i = 0; i < _rules.length; i++) {
          this.ruler.push(_rules[i][0], _rules[i][1], { alt: (_rules[i][2] || []).slice() });
        }
      }
      
      
      // Generate tokens for input range
      //
      ParserBlock.prototype.tokenize = function (state, startLine, endLine) {
        var ok, i,
            rules = this.ruler.getRules(''),
            len = rules.length,
            line = startLine,
            hasEmptyLines = false,
            maxNesting = state.md.options.maxNesting;
      
        while (line < endLine) {
          state.line = line = state.skipEmptyLines(line);
          if (line >= endLine) { break; }
      
          // Termination condition for nested calls.
          // Nested calls currently used for blockquotes & lists
          if (state.sCount[line] < state.blkIndent) { break; }
      
          // If nesting level exceeded - skip tail to the end. That's not ordinary
          // situation and we should not care about content.
          if (state.level >= maxNesting) {
            state.line = endLine;
            break;
          }
      
          // Try all possible rules.
          // On success, rule should:
          //
          // - update `state.line`
          // - update `state.tokens`
          // - return true
      
          for (i = 0; i < len; i++) {
            ok = rules[i](state, line, endLine, false);
            if (ok) { break; }
          }
      
          // set state.tight if we had an empty line before current tag
          // i.e. latest empty line should not count
          state.tight = !hasEmptyLines;
      
          // paragraph might "eat" one newline after it in nested lists
          if (state.isEmpty(state.line - 1)) {
            hasEmptyLines = true;
          }
      
          line = state.line;
      
          if (line < endLine && state.isEmpty(line)) {
            hasEmptyLines = true;
            line++;
            state.line = line;
          }
        }
      };
      
      
      /**
       * ParserBlock.parse(str, md, env, outTokens)
       *
       * Process input string and push block tokens into `outTokens`
       **/
      ParserBlock.prototype.parse = function (src, md, env, outTokens) {
        var state;
      
        if (!src) { return; }
      
        state = new this.State(src, md, env, outTokens);
      
        this.tokenize(state, state.line, state.lineMax);
      };
      
      
      ParserBlock.prototype.State = require('./rules_block/state_block');
      
      
      module.exports = ParserBlock;
      
      },{"./ruler":17,"./rules_block/blockquote":18,"./rules_block/code":19,"./rules_block/fence":20,"./rules_block/heading":21,"./rules_block/hr":22,"./rules_block/html_block":23,"./rules_block/lheading":24,"./rules_block/list":25,"./rules_block/paragraph":26,"./rules_block/reference":27,"./rules_block/state_block":28,"./rules_block/table":29}],11:[function(require,module,exports){
      
      
      var Ruler  = require('./ruler');
      
      
      var _rules = [
        [ 'normalize',      require('./rules_core/normalize')      ],
        [ 'block',          require('./rules_core/block')          ],
        [ 'inline',         require('./rules_core/inline')         ],
        [ 'linkify',        require('./rules_core/linkify')        ],
        [ 'replacements',   require('./rules_core/replacements')   ],
        [ 'smartquotes',    require('./rules_core/smartquotes')    ]
      ];
      
      
      /**
       * new Core()
       **/
      function Core() {
        /**
         * Core#ruler -> Ruler
         *
         * [[Ruler]] instance. Keep configuration of core rules.
         **/
        this.ruler = new Ruler();
      
        for (var i = 0; i < _rules.length; i++) {
          this.ruler.push(_rules[i][0], _rules[i][1]);
        }
      }
      
      
      /**
       * Core.process(state)
       *
       * Executes core chain rules.
       **/
      Core.prototype.process = function (state) {
        var i, l, rules;
      
        rules = this.ruler.getRules('');
      
        for (i = 0, l = rules.length; i < l; i++) {
          rules[i](state);
        }
      };
      
      Core.prototype.State = require('./rules_core/state_core');
      
      
      module.exports = Core;
      
      },{"./ruler":17,"./rules_core/block":30,"./rules_core/inline":31,"./rules_core/linkify":32,"./rules_core/normalize":33,"./rules_core/replacements":34,"./rules_core/smartquotes":35,"./rules_core/state_core":36}],12:[function(require,module,exports){
      
      
      var Ruler           = require('./ruler');
      
      
      ////////////////////////////////////////////////////////////////////////////////
      // Parser rules
      
      var _rules = [
        [ 'text',            require('./rules_inline/text') ],
        [ 'newline',         require('./rules_inline/newline') ],
        [ 'escape',          require('./rules_inline/escape') ],
        [ 'backticks',       require('./rules_inline/backticks') ],
        [ 'strikethrough',   require('./rules_inline/strikethrough').tokenize ],
        [ 'emphasis',        require('./rules_inline/emphasis').tokenize ],
        [ 'link',            require('./rules_inline/link') ],
        [ 'image',           require('./rules_inline/image') ],
        [ 'autolink',        require('./rules_inline/autolink') ],
        [ 'html_inline',     require('./rules_inline/html_inline') ],
        [ 'entity',          require('./rules_inline/entity') ]
      ];
      
      var _rules2 = [
        [ 'balance_pairs',   require('./rules_inline/balance_pairs') ],
        [ 'strikethrough',   require('./rules_inline/strikethrough').postProcess ],
        [ 'emphasis',        require('./rules_inline/emphasis').postProcess ],
        [ 'text_collapse',   require('./rules_inline/text_collapse') ]
      ];
      
      
      /**
       * new ParserInline()
       **/
      function ParserInline() {
        var i;
      
        /**
         * ParserInline#ruler -> Ruler
         *
         * [[Ruler]] instance. Keep configuration of inline rules.
         **/
        this.ruler = new Ruler();
      
        for (i = 0; i < _rules.length; i++) {
          this.ruler.push(_rules[i][0], _rules[i][1]);
        }
      
        /**
         * ParserInline#ruler2 -> Ruler
         *
         * [[Ruler]] instance. Second ruler used for post-processing
         * (e.g. in emphasis-like rules).
         **/
        this.ruler2 = new Ruler();
      
        for (i = 0; i < _rules2.length; i++) {
          this.ruler2.push(_rules2[i][0], _rules2[i][1]);
        }
      }
      
      
      // Skip single token by running all rules in validation mode;
      // returns `true` if any rule reported success
      //
      ParserInline.prototype.skipToken = function (state) {
        var ok, i, pos = state.pos,
            rules = this.ruler.getRules(''),
            len = rules.length,
            maxNesting = state.md.options.maxNesting,
            cache = state.cache;
      
      
        if (typeof cache[pos] !== 'undefined') {
          state.pos = cache[pos];
          return;
        }
      
        if (state.level < maxNesting) {
          for (i = 0; i < len; i++) {
            // Increment state.level and decrement it later to limit recursion.
            // It's harmless to do here, because no tokens are created. But ideally,
            // we'd need a separate private state variable for this purpose.
            //
            state.level++;
            ok = rules[i](state, true);
            state.level--;
      
            if (ok) { break; }
          }
        } else {
          // Too much nesting, just skip until the end of the paragraph.
          //
          // NOTE: this will cause links to behave incorrectly in the following case,
          //       when an amount of `[` is exactly equal to `maxNesting + 1`:
          //
          //       [[[[[[[[[[[[[[[[[[[[[foo]()
          //
          // TODO: remove this workaround when CM standard will allow nested links
          //       (we can replace it by preventing links from being parsed in
          //       validation mode)
          //
          state.pos = state.posMax;
        }
      
        if (!ok) { state.pos++; }
        cache[pos] = state.pos;
      };
      
      
      // Generate tokens for input range
      //
      ParserInline.prototype.tokenize = function (state) {
        var ok, i,
            rules = this.ruler.getRules(''),
            len = rules.length,
            end = state.posMax,
            maxNesting = state.md.options.maxNesting;
      
        while (state.pos < end) {
          // Try all possible rules.
          // On success, rule should:
          //
          // - update `state.pos`
          // - update `state.tokens`
          // - return true
      
          if (state.level < maxNesting) {
            for (i = 0; i < len; i++) {
              ok = rules[i](state, false);
              if (ok) { break; }
            }
          }
      
          if (ok) {
            if (state.pos >= end) { break; }
            continue;
          }
      
          state.pending += state.src[state.pos++];
        }
      
        if (state.pending) {
          state.pushPending();
        }
      };
      
      
      /**
       * ParserInline.parse(str, md, env, outTokens)
       *
       * Process input string and push inline tokens into `outTokens`
       **/
      ParserInline.prototype.parse = function (str, md, env, outTokens) {
        var i, rules, len;
        var state = new this.State(str, md, env, outTokens);
      
        this.tokenize(state);
      
        rules = this.ruler2.getRules('');
        len = rules.length;
      
        for (i = 0; i < len; i++) {
          rules[i](state);
        }
      };
      
      
      ParserInline.prototype.State = require('./rules_inline/state_inline');
      
      
      module.exports = ParserInline;
      
      },{"./ruler":17,"./rules_inline/autolink":37,"./rules_inline/backticks":38,"./rules_inline/balance_pairs":39,"./rules_inline/emphasis":40,"./rules_inline/entity":41,"./rules_inline/escape":42,"./rules_inline/html_inline":43,"./rules_inline/image":44,"./rules_inline/link":45,"./rules_inline/newline":46,"./rules_inline/state_inline":47,"./rules_inline/strikethrough":48,"./rules_inline/text":49,"./rules_inline/text_collapse":50}],13:[function(require,module,exports){
      
      
      module.exports = {
        options: {
          html:         true,         // Enable HTML tags in source
          xhtmlOut:     true,         // Use '/' to close single tags (<br />)
          breaks:       false,        // Convert '\n' in paragraphs into <br>
          langPrefix:   'language-',  // CSS language prefix for fenced blocks
          linkify:      false,        // autoconvert URL-like texts to links
      
          // Enable some language-neutral replacements + quotes beautification
          typographer:  false,
      
          // Double + single quotes replacement pairs, when typographer enabled,
          // and smartquotes on. Could be either a String or an Array.
          //
          // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
          // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
          quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */
      
          // Highlighter function. Should return escaped HTML,
          // or '' if the source string is not changed and should be escaped externaly.
          // If result starts with <pre... internal wrapper is skipped.
          //
          // function (/*str, lang*/) { return ''; }
          //
          highlight: null,
      
          maxNesting:   20            // Internal protection, recursion limit
        },
      
        components: {
      
          core: {
            rules: [
              'normalize',
              'block',
              'inline'
            ]
          },
      
          block: {
            rules: [
              'blockquote',
              'code',
              'fence',
              'heading',
              'hr',
              'html_block',
              'lheading',
              'list',
              'reference',
              'paragraph'
            ]
          },
      
          inline: {
            rules: [
              'autolink',
              'backticks',
              'emphasis',
              'entity',
              'escape',
              'html_inline',
              'image',
              'link',
              'newline',
              'text'
            ],
            rules2: [
              'balance_pairs',
              'emphasis',
              'text_collapse'
            ]
          }
        }
      };
      
      },{}],14:[function(require,module,exports){
      
      
      module.exports = {
        options: {
          html:         false,        // Enable HTML tags in source
          xhtmlOut:     false,        // Use '/' to close single tags (<br />)
          breaks:       false,        // Convert '\n' in paragraphs into <br>
          langPrefix:   'language-',  // CSS language prefix for fenced blocks
          linkify:      false,        // autoconvert URL-like texts to links
      
          // Enable some language-neutral replacements + quotes beautification
          typographer:  false,
      
          // Double + single quotes replacement pairs, when typographer enabled,
          // and smartquotes on. Could be either a String or an Array.
          //
          // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
          // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
          quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */
      
          // Highlighter function. Should return escaped HTML,
          // or '' if the source string is not changed and should be escaped externaly.
          // If result starts with <pre... internal wrapper is skipped.
          //
          // function (/*str, lang*/) { return ''; }
          //
          highlight: null,
      
          maxNesting:   100            // Internal protection, recursion limit
        },
      
        components: {
      
          core: {},
          block: {},
          inline: {}
        }
      };
      
      },{}],15:[function(require,module,exports){
      
      
      module.exports = {
        options: {
          html:         false,        // Enable HTML tags in source
          xhtmlOut:     false,        // Use '/' to close single tags (<br />)
          breaks:       false,        // Convert '\n' in paragraphs into <br>
          langPrefix:   'language-',  // CSS language prefix for fenced blocks
          linkify:      false,        // autoconvert URL-like texts to links
      
          // Enable some language-neutral replacements + quotes beautification
          typographer:  false,
      
          // Double + single quotes replacement pairs, when typographer enabled,
          // and smartquotes on. Could be either a String or an Array.
          //
          // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
          // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
          quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */
      
          // Highlighter function. Should return escaped HTML,
          // or '' if the source string is not changed and should be escaped externaly.
          // If result starts with <pre... internal wrapper is skipped.
          //
          // function (/*str, lang*/) { return ''; }
          //
          highlight: null,
      
          maxNesting:   20            // Internal protection, recursion limit
        },
      
        components: {
      
          core: {
            rules: [
              'normalize',
              'block',
              'inline'
            ]
          },
      
          block: {
            rules: [
              'paragraph'
            ]
          },
      
          inline: {
            rules: [
              'text'
            ],
            rules2: [
              'balance_pairs',
              'text_collapse'
            ]
          }
        }
      };
      
      },{}],16:[function(require,module,exports){
      
      
      var assign          = require('./common/utils').assign;
      var unescapeAll     = require('./common/utils').unescapeAll;
      var escapeHtml      = require('./common/utils').escapeHtml;
      
      
      ////////////////////////////////////////////////////////////////////////////////
      
      var default_rules = {};
      
      
      default_rules.code_inline = function (tokens, idx, options, env, slf) {
        var token = tokens[idx];
      
        return  '<code' + slf.renderAttrs(token) + '>' +
                escapeHtml(tokens[idx].content) +
                '</code>';
      };
      
      
      default_rules.code_block = function (tokens, idx, options, env, slf) {
        var token = tokens[idx];
      
        return  '<pre' + slf.renderAttrs(token) + '><code>' +
                escapeHtml(tokens[idx].content) +
                '</code></pre>\n';
      };
      
      
      default_rules.fence = function (tokens, idx, options, env, slf) {
        var token = tokens[idx],
            info = token.info ? unescapeAll(token.info).trim() : '',
            langName = '',
            highlighted, i, tmpAttrs, tmpToken;
      
        if (info) {
          langName = info.split(/\s+/g)[0];
        }
      
        if (options.highlight) {
          highlighted = options.highlight(token.content, langName) || escapeHtml(token.content);
        } else {
          highlighted = escapeHtml(token.content);
        }
      
        if (highlighted.indexOf('<pre') === 0) {
          return highlighted + '\n';
        }
      
        // If language exists, inject class gently, without modifying original token.
        // May be, one day we will add .clone() for token and simplify this part, but
        // now we prefer to keep things local.
        if (info) {
          i        = token.attrIndex('class');
          tmpAttrs = token.attrs ? token.attrs.slice() : [];
      
          if (i < 0) {
            tmpAttrs.push([ 'class', options.langPrefix + langName ]);
          } else {
            tmpAttrs[i][1] += ' ' + options.langPrefix + langName;
          }
      
          // Fake token just to render attributes
          tmpToken = {
            attrs: tmpAttrs
          };
      
          return  '<pre><code' + slf.renderAttrs(tmpToken) + '>'
                + highlighted
                + '</code></pre>\n';
        }
      
      
        return  '<pre><code' + slf.renderAttrs(token) + '>'
              + highlighted
              + '</code></pre>\n';
      };
      
      
      default_rules.image = function (tokens, idx, options, env, slf) {
        var token = tokens[idx];
      
        // "alt" attr MUST be set, even if empty. Because it's mandatory and
        // should be placed on proper position for tests.
        //
        // Replace content with actual value
      
        token.attrs[token.attrIndex('alt')][1] =
          slf.renderInlineAsText(token.children, options, env);
      
        return slf.renderToken(tokens, idx, options);
      };
      
      
      default_rules.hardbreak = function (tokens, idx, options /*, env */) {
        return options.xhtmlOut ? '<br />\n' : '<br>\n';
      };
      default_rules.softbreak = function (tokens, idx, options /*, env */) {
        return options.breaks ? (options.xhtmlOut ? '<br />\n' : '<br>\n') : '\n';
      };
      
      
      default_rules.text = function (tokens, idx /*, options, env */) {
        return escapeHtml(tokens[idx].content);
      };
      
      
      default_rules.html_block = function (tokens, idx /*, options, env */) {
        return tokens[idx].content;
      };
      default_rules.html_inline = function (tokens, idx /*, options, env */) {
        return tokens[idx].content;
      };
      
      
      /**
       * new Renderer()
       *
       * Creates new [[Renderer]] instance and fill [[Renderer#rules]] with defaults.
       **/
      function Renderer() {
      
        /**
         * Renderer#rules -> Object
         *
         * Contains render rules for tokens. Can be updated and extended.
         *
         * ##### Example
         *
         * ```javascript
         * var md = require('markdown-it')();
         *
         * md.renderer.rules.strong_open  = function () { return '<b>'; };
         * md.renderer.rules.strong_close = function () { return '</b>'; };
         *
         * var result = md.renderInline(...);
         * ```
         *
         * Each rule is called as independent static function with fixed signature:
         *
         * ```javascript
         * function my_token_render(tokens, idx, options, env, renderer) {
         *   // ...
         *   return renderedHTML;
         * }
         * ```
         *
         * See [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js)
         * for more details and examples.
         **/
        this.rules = assign({}, default_rules);
      }
      
      
      /**
       * Renderer.renderAttrs(token) -> String
       *
       * Render token attributes to string.
       **/
      Renderer.prototype.renderAttrs = function renderAttrs(token) {
        var i, l, result;
      
        if (!token.attrs) { return ''; }
      
        result = '';
      
        for (i = 0, l = token.attrs.length; i < l; i++) {
          result += ' ' + escapeHtml(token.attrs[i][0]) + '="' + escapeHtml(token.attrs[i][1]) + '"';
        }
      
        return result;
      };
      
      
      /**
       * Renderer.renderToken(tokens, idx, options) -> String
       * - tokens (Array): list of tokens
       * - idx (Numbed): token index to render
       * - options (Object): params of parser instance
       *
       * Default token renderer. Can be overriden by custom function
       * in [[Renderer#rules]].
       **/
      Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
        var nextToken,
            result = '',
            needLf = false,
            token = tokens[idx];
      
        // Tight list paragraphs
        if (token.hidden) {
          return '';
        }
      
        // Insert a newline between hidden paragraph and subsequent opening
        // block-level tag.
        //
        // For example, here we should insert a newline before blockquote:
        //  - a
        //    >
        //
        if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
          result += '\n';
        }
      
        // Add token name, e.g. `<img`
        result += (token.nesting === -1 ? '</' : '<') + token.tag;
      
        // Encode attributes, e.g. `<img src="foo"`
        result += this.renderAttrs(token);
      
        // Add a slash for self-closing tags, e.g. `<img src="foo" /`
        if (token.nesting === 0 && options.xhtmlOut) {
          result += ' /';
        }
      
        // Check if we need to add a newline after this tag
        if (token.block) {
          needLf = true;
      
          if (token.nesting === 1) {
            if (idx + 1 < tokens.length) {
              nextToken = tokens[idx + 1];
      
              if (nextToken.type === 'inline' || nextToken.hidden) {
                // Block-level tag containing an inline tag.
                //
                needLf = false;
      
              } else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
                // Opening tag + closing tag of the same type. E.g. `<li></li>`.
                //
                needLf = false;
              }
            }
          }
        }
      
        result += needLf ? '>\n' : '>';
      
        return result;
      };
      
      
      /**
       * Renderer.renderInline(tokens, options, env) -> String
       * - tokens (Array): list on block tokens to renter
       * - options (Object): params of parser instance
       * - env (Object): additional data from parsed input (references, for example)
       *
       * The same as [[Renderer.render]], but for single token of `inline` type.
       **/
      Renderer.prototype.renderInline = function (tokens, options, env) {
        var type,
            result = '',
            rules = this.rules;
      
        for (var i = 0, len = tokens.length; i < len; i++) {
          type = tokens[i].type;
      
          if (typeof rules[type] !== 'undefined') {
            result += rules[type](tokens, i, options, env, this);
          } else {
            result += this.renderToken(tokens, i, options);
          }
        }
      
        return result;
      };
      
      
      /** internal
       * Renderer.renderInlineAsText(tokens, options, env) -> String
       * - tokens (Array): list on block tokens to renter
       * - options (Object): params of parser instance
       * - env (Object): additional data from parsed input (references, for example)
       *
       * Special kludge for image `alt` attributes to conform CommonMark spec.
       * Don't try to use it! Spec requires to show `alt` content with stripped markup,
       * instead of simple escaping.
       **/
      Renderer.prototype.renderInlineAsText = function (tokens, options, env) {
        var result = '';
      
        for (var i = 0, len = tokens.length; i < len; i++) {
          if (tokens[i].type === 'text') {
            result += tokens[i].content;
          } else if (tokens[i].type === 'image') {
            result += this.renderInlineAsText(tokens[i].children, options, env);
          }
        }
      
        return result;
      };
      
      
      /**
       * Renderer.render(tokens, options, env) -> String
       * - tokens (Array): list on block tokens to renter
       * - options (Object): params of parser instance
       * - env (Object): additional data from parsed input (references, for example)
       *
       * Takes token stream and generates HTML. Probably, you will never need to call
       * this method directly.
       **/
      Renderer.prototype.render = function (tokens, options, env) {
        var i, len, type,
            result = '',
            rules = this.rules;
      
        for (i = 0, len = tokens.length; i < len; i++) {
          type = tokens[i].type;
      
          if (type === 'inline') {
            result += this.renderInline(tokens[i].children, options, env);
          } else if (typeof rules[type] !== 'undefined') {
            result += rules[tokens[i].type](tokens, i, options, env, this);
          } else {
            result += this.renderToken(tokens, i, options, env);
          }
        }
      
        return result;
      };
      
      module.exports = Renderer;
      
      },{"./common/utils":4}],17:[function(require,module,exports){
      
      
      /**
       * new Ruler()
       **/
      function Ruler() {
        // List of added rules. Each element is:
        //
        // {
        //   name: XXX,
        //   enabled: Boolean,
        //   fn: Function(),
        //   alt: [ name2, name3 ]
        // }
        //
        this.__rules__ = [];
      
        // Cached rule chains.
        //
        // First level - chain name, '' for default.
        // Second level - diginal anchor for fast filtering by charcodes.
        //
        this.__cache__ = null;
      }
      
      ////////////////////////////////////////////////////////////////////////////////
      // Helper methods, should not be used directly
      
      
      // Find rule index by name
      //
      Ruler.prototype.__find__ = function (name) {
        for (var i = 0; i < this.__rules__.length; i++) {
          if (this.__rules__[i].name === name) {
            return i;
          }
        }
        return -1;
      };
      
      
      // Build rules lookup cache
      //
      Ruler.prototype.__compile__ = function () {
        var self = this;
        var chains = [ '' ];
      
        // collect unique names
        self.__rules__.forEach(function (rule) {
          if (!rule.enabled) { return; }
      
          rule.alt.forEach(function (altName) {
            if (chains.indexOf(altName) < 0) {
              chains.push(altName);
            }
          });
        });
      
        self.__cache__ = {};
      
        chains.forEach(function (chain) {
          self.__cache__[chain] = [];
          self.__rules__.forEach(function (rule) {
            if (!rule.enabled) { return; }
      
            if (chain && rule.alt.indexOf(chain) < 0) { return; }
      
            self.__cache__[chain].push(rule.fn);
          });
        });
      };
      
      
      /**
       * Ruler.at(name, fn [, options])
       * - name (String): rule name to replace.
       * - fn (Function): new rule function.
       * - options (Object): new rule options (not mandatory).
       *
       * Replace rule by name with new function & options. Throws error if name not
       * found.
       *
       * ##### Options:
       *
       * - __alt__ - array with names of "alternate" chains.
       *
       * ##### Example
       *
       * Replace existing typographer replacement rule with new one:
       *
       * ```javascript
       * var md = require('markdown-it')();
       *
       * md.core.ruler.at('replacements', function replace(state) {
       *   //...
       * });
       * ```
       **/
      Ruler.prototype.at = function (name, fn, options) {
        var index = this.__find__(name);
        var opt = options || {};
      
        if (index === -1) { throw new Error('Parser rule not found: ' + name); }
      
        this.__rules__[index].fn = fn;
        this.__rules__[index].alt = opt.alt || [];
        this.__cache__ = null;
      };
      
      
      /**
       * Ruler.before(beforeName, ruleName, fn [, options])
       * - beforeName (String): new rule will be added before this one.
       * - ruleName (String): name of added rule.
       * - fn (Function): rule function.
       * - options (Object): rule options (not mandatory).
       *
       * Add new rule to chain before one with given name. See also
       * [[Ruler.after]], [[Ruler.push]].
       *
       * ##### Options:
       *
       * - __alt__ - array with names of "alternate" chains.
       *
       * ##### Example
       *
       * ```javascript
       * var md = require('markdown-it')();
       *
       * md.block.ruler.before('paragraph', 'my_rule', function replace(state) {
       *   //...
       * });
       * ```
       **/
      Ruler.prototype.before = function (beforeName, ruleName, fn, options) {
        var index = this.__find__(beforeName);
        var opt = options || {};
      
        if (index === -1) { throw new Error('Parser rule not found: ' + beforeName); }
      
        this.__rules__.splice(index, 0, {
          name: ruleName,
          enabled: true,
          fn: fn,
          alt: opt.alt || []
        });
      
        this.__cache__ = null;
      };
      
      
      /**
       * Ruler.after(afterName, ruleName, fn [, options])
       * - afterName (String): new rule will be added after this one.
       * - ruleName (String): name of added rule.
       * - fn (Function): rule function.
       * - options (Object): rule options (not mandatory).
       *
       * Add new rule to chain after one with given name. See also
       * [[Ruler.before]], [[Ruler.push]].
       *
       * ##### Options:
       *
       * - __alt__ - array with names of "alternate" chains.
       *
       * ##### Example
       *
       * ```javascript
       * var md = require('markdown-it')();
       *
       * md.inline.ruler.after('text', 'my_rule', function replace(state) {
       *   //...
       * });
       * ```
       **/
      Ruler.prototype.after = function (afterName, ruleName, fn, options) {
        var index = this.__find__(afterName);
        var opt = options || {};
      
        if (index === -1) { throw new Error('Parser rule not found: ' + afterName); }
      
        this.__rules__.splice(index + 1, 0, {
          name: ruleName,
          enabled: true,
          fn: fn,
          alt: opt.alt || []
        });
      
        this.__cache__ = null;
      };
      
      /**
       * Ruler.push(ruleName, fn [, options])
       * - ruleName (String): name of added rule.
       * - fn (Function): rule function.
       * - options (Object): rule options (not mandatory).
       *
       * Push new rule to the end of chain. See also
       * [[Ruler.before]], [[Ruler.after]].
       *
       * ##### Options:
       *
       * - __alt__ - array with names of "alternate" chains.
       *
       * ##### Example
       *
       * ```javascript
       * var md = require('markdown-it')();
       *
       * md.core.ruler.push('my_rule', function replace(state) {
       *   //...
       * });
       * ```
       **/
      Ruler.prototype.push = function (ruleName, fn, options) {
        var opt = options || {};
      
        this.__rules__.push({
          name: ruleName,
          enabled: true,
          fn: fn,
          alt: opt.alt || []
        });
      
        this.__cache__ = null;
      };
      
      
      /**
       * Ruler.enable(list [, ignoreInvalid]) -> Array
       * - list (String|Array): list of rule names to enable.
       * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
       *
       * Enable rules with given names. If any rule name not found - throw Error.
       * Errors can be disabled by second param.
       *
       * Returns list of found rule names (if no exception happened).
       *
       * See also [[Ruler.disable]], [[Ruler.enableOnly]].
       **/
      Ruler.prototype.enable = function (list, ignoreInvalid) {
        if (!Array.isArray(list)) { list = [ list ]; }
      
        var result = [];
      
        // Search by name and enable
        list.forEach(function (name) {
          var idx = this.__find__(name);
      
          if (idx < 0) {
            if (ignoreInvalid) { return; }
            throw new Error('Rules manager: invalid rule name ' + name);
          }
          this.__rules__[idx].enabled = true;
          result.push(name);
        }, this);
      
        this.__cache__ = null;
        return result;
      };
      
      
      /**
       * Ruler.enableOnly(list [, ignoreInvalid])
       * - list (String|Array): list of rule names to enable (whitelist).
       * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
       *
       * Enable rules with given names, and disable everything else. If any rule name
       * not found - throw Error. Errors can be disabled by second param.
       *
       * See also [[Ruler.disable]], [[Ruler.enable]].
       **/
      Ruler.prototype.enableOnly = function (list, ignoreInvalid) {
        if (!Array.isArray(list)) { list = [ list ]; }
      
        this.__rules__.forEach(function (rule) { rule.enabled = false; });
      
        this.enable(list, ignoreInvalid);
      };
      
      
      /**
       * Ruler.disable(list [, ignoreInvalid]) -> Array
       * - list (String|Array): list of rule names to disable.
       * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
       *
       * Disable rules with given names. If any rule name not found - throw Error.
       * Errors can be disabled by second param.
       *
       * Returns list of found rule names (if no exception happened).
       *
       * See also [[Ruler.enable]], [[Ruler.enableOnly]].
       **/
      Ruler.prototype.disable = function (list, ignoreInvalid) {
        if (!Array.isArray(list)) { list = [ list ]; }
      
        var result = [];
      
        // Search by name and disable
        list.forEach(function (name) {
          var idx = this.__find__(name);
      
          if (idx < 0) {
            if (ignoreInvalid) { return; }
            throw new Error('Rules manager: invalid rule name ' + name);
          }
          this.__rules__[idx].enabled = false;
          result.push(name);
        }, this);
      
        this.__cache__ = null;
        return result;
      };
      
      
      /**
       * Ruler.getRules(chainName) -> Array
       *
       * Return array of active functions (rules) for given chain name. It analyzes
       * rules configuration, compiles caches if not exists and returns result.
       *
       * Default chain name is `''` (empty string). It can't be skipped. That's
       * done intentionally, to keep signature monomorphic for high speed.
       **/
      Ruler.prototype.getRules = function (chainName) {
        if (this.__cache__ === null) {
          this.__compile__();
        }
      
        // Chain can be empty, if rules disabled. But we still have to return Array.
        return this.__cache__[chainName] || [];
      };
      
      module.exports = Ruler;
      
      },{}],18:[function(require,module,exports){
      
      var isSpace = require('../common/utils').isSpace;
      
      
      module.exports = function blockquote(state, startLine, endLine, silent) {
        var adjustTab,
            ch,
            i,
            initial,
            l,
            lastLineEmpty,
            lines,
            nextLine,
            offset,
            oldBMarks,
            oldBSCount,
            oldIndent,
            oldParentType,
            oldSCount,
            oldTShift,
            spaceAfterMarker,
            terminate,
            terminatorRules,
            token,
            wasOutdented,
            oldLineMax = state.lineMax,
            pos = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine];
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        // check the block quote marker
        if (state.src.charCodeAt(pos++) !== 0x3E/* > */) { return false; }
      
        // we know that it's going to be a valid blockquote,
        // so no point trying to find the end of it in silent mode
        if (silent) { return true; }
      
        // skip spaces after ">" and re-calculate offset
        initial = offset = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
      
        // skip one optional space after '>'
        if (state.src.charCodeAt(pos) === 0x20 /* space */) {
          // ' >   test '
          //     ^ -- position start of line here:
          pos++;
          initial++;
          offset++;
          adjustTab = false;
          spaceAfterMarker = true;
        } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
          spaceAfterMarker = true;
      
          if ((state.bsCount[startLine] + offset) % 4 === 3) {
            // '  >\t  test '
            //       ^ -- position start of line here (tab has width===1)
            pos++;
            initial++;
            offset++;
            adjustTab = false;
          } else {
            // ' >\t  test '
            //    ^ -- position start of line here + shift bsCount slightly
            //         to make extra space appear
            adjustTab = true;
          }
        } else {
          spaceAfterMarker = false;
        }
      
        oldBMarks = [ state.bMarks[startLine] ];
        state.bMarks[startLine] = pos;
      
        while (pos < max) {
          ch = state.src.charCodeAt(pos);
      
          if (isSpace(ch)) {
            if (ch === 0x09) {
              offset += 4 - (offset + state.bsCount[startLine] + (adjustTab ? 1 : 0)) % 4;
            } else {
              offset++;
            }
          } else {
            break;
          }
      
          pos++;
        }
      
        oldBSCount = [ state.bsCount[startLine] ];
        state.bsCount[startLine] = state.sCount[startLine] + 1 + (spaceAfterMarker ? 1 : 0);
      
        lastLineEmpty = pos >= max;
      
        oldSCount = [ state.sCount[startLine] ];
        state.sCount[startLine] = offset - initial;
      
        oldTShift = [ state.tShift[startLine] ];
        state.tShift[startLine] = pos - state.bMarks[startLine];
      
        terminatorRules = state.md.block.ruler.getRules('blockquote');
      
        oldParentType = state.parentType;
        state.parentType = 'blockquote';
        wasOutdented = false;
      
        // Search the end of the block
        //
        // Block ends with either:
        //  1. an empty line outside:
        //     ```
        //     > test
        //
        //     ```
        //  2. an empty line inside:
        //     ```
        //     >
        //     test
        //     ```
        //  3. another tag:
        //     ```
        //     > test
        //      - - -
        //     ```
        for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
          // check if it's outdented, i.e. it's inside list item and indented
          // less than said list item:
          //
          // ```
          // 1. anything
          //    > current blockquote
          // 2. checking this line
          // ```
          if (state.sCount[nextLine] < state.blkIndent) wasOutdented = true;
      
          pos = state.bMarks[nextLine] + state.tShift[nextLine];
          max = state.eMarks[nextLine];
      
          if (pos >= max) {
            // Case 1: line is not inside the blockquote, and this line is empty.
            break;
          }
      
          if (state.src.charCodeAt(pos++) === 0x3E/* > */ && !wasOutdented) {
            // This line is inside the blockquote.
      
            // skip spaces after ">" and re-calculate offset
            initial = offset = state.sCount[nextLine] + pos - (state.bMarks[nextLine] + state.tShift[nextLine]);
      
            // skip one optional space after '>'
            if (state.src.charCodeAt(pos) === 0x20 /* space */) {
              // ' >   test '
              //     ^ -- position start of line here:
              pos++;
              initial++;
              offset++;
              adjustTab = false;
              spaceAfterMarker = true;
            } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
              spaceAfterMarker = true;
      
              if ((state.bsCount[nextLine] + offset) % 4 === 3) {
                // '  >\t  test '
                //       ^ -- position start of line here (tab has width===1)
                pos++;
                initial++;
                offset++;
                adjustTab = false;
              } else {
                // ' >\t  test '
                //    ^ -- position start of line here + shift bsCount slightly
                //         to make extra space appear
                adjustTab = true;
              }
            } else {
              spaceAfterMarker = false;
            }
      
            oldBMarks.push(state.bMarks[nextLine]);
            state.bMarks[nextLine] = pos;
      
            while (pos < max) {
              ch = state.src.charCodeAt(pos);
      
              if (isSpace(ch)) {
                if (ch === 0x09) {
                  offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
                } else {
                  offset++;
                }
              } else {
                break;
              }
      
              pos++;
            }
      
            lastLineEmpty = pos >= max;
      
            oldBSCount.push(state.bsCount[nextLine]);
            state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
      
            oldSCount.push(state.sCount[nextLine]);
            state.sCount[nextLine] = offset - initial;
      
            oldTShift.push(state.tShift[nextLine]);
            state.tShift[nextLine] = pos - state.bMarks[nextLine];
            continue;
          }
      
          // Case 2: line is not inside the blockquote, and the last line was empty.
          if (lastLineEmpty) { break; }
      
          // Case 3: another tag found.
          terminate = false;
          for (i = 0, l = terminatorRules.length; i < l; i++) {
            if (terminatorRules[i](state, nextLine, endLine, true)) {
              terminate = true;
              break;
            }
          }
      
          if (terminate) {
            // Quirk to enforce "hard termination mode" for paragraphs;
            // normally if you call `tokenize(state, startLine, nextLine)`,
            // paragraphs will look below nextLine for paragraph continuation,
            // but if blockquote is terminated by another tag, they shouldn't
            state.lineMax = nextLine;
      
            if (state.blkIndent !== 0) {
              // state.blkIndent was non-zero, we now set it to zero,
              // so we need to re-calculate all offsets to appear as
              // if indent wasn't changed
              oldBMarks.push(state.bMarks[nextLine]);
              oldBSCount.push(state.bsCount[nextLine]);
              oldTShift.push(state.tShift[nextLine]);
              oldSCount.push(state.sCount[nextLine]);
              state.sCount[nextLine] -= state.blkIndent;
            }
      
            break;
          }
      
          oldBMarks.push(state.bMarks[nextLine]);
          oldBSCount.push(state.bsCount[nextLine]);
          oldTShift.push(state.tShift[nextLine]);
          oldSCount.push(state.sCount[nextLine]);
      
          // A negative indentation means that this is a paragraph continuation
          //
          state.sCount[nextLine] = -1;
        }
      
        oldIndent = state.blkIndent;
        state.blkIndent = 0;
      
        token        = state.push('blockquote_open', 'blockquote', 1);
        token.markup = '>';
        token.map    = lines = [ startLine, 0 ];
      
        state.md.block.tokenize(state, startLine, nextLine);
      
        token        = state.push('blockquote_close', 'blockquote', -1);
        token.markup = '>';
      
        state.lineMax = oldLineMax;
        state.parentType = oldParentType;
        lines[1] = state.line;
      
        // Restore original tShift; this might not be necessary since the parser
        // has already been here, but just to make sure we can do that.
        for (i = 0; i < oldTShift.length; i++) {
          state.bMarks[i + startLine] = oldBMarks[i];
          state.tShift[i + startLine] = oldTShift[i];
          state.sCount[i + startLine] = oldSCount[i];
          state.bsCount[i + startLine] = oldBSCount[i];
        }
        state.blkIndent = oldIndent;
      
        return true;
      };
      
      },{"../common/utils":4}],19:[function(require,module,exports){
      
      
      module.exports = function code(state, startLine, endLine/*, silent*/) {
        var nextLine, last, token;
      
        if (state.sCount[startLine] - state.blkIndent < 4) { return false; }
      
        last = nextLine = startLine + 1;
      
        while (nextLine < endLine) {
          if (state.isEmpty(nextLine)) {
            nextLine++;
            continue;
          }
      
          if (state.sCount[nextLine] - state.blkIndent >= 4) {
            nextLine++;
            last = nextLine;
            continue;
          }
          break;
        }
      
        state.line = last;
      
        token         = state.push('code_block', 'code', 0);
        token.content = state.getLines(startLine, last, 4 + state.blkIndent, true);
        token.map     = [ startLine, state.line ];
      
        return true;
      };
      
      },{}],20:[function(require,module,exports){
      
      
      module.exports = function fence(state, startLine, endLine, silent) {
        var marker, len, params, nextLine, mem, token, markup,
            haveEndMarker = false,
            pos = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine];
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        if (pos + 3 > max) { return false; }
      
        marker = state.src.charCodeAt(pos);
      
        if (marker !== 0x7E/* ~ */ && marker !== 0x60 /* ` */) {
          return false;
        }
      
        // scan marker length
        mem = pos;
        pos = state.skipChars(pos, marker);
      
        len = pos - mem;
      
        if (len < 3) { return false; }
      
        markup = state.src.slice(mem, pos);
        params = state.src.slice(pos, max);
      
        if (marker === 0x60 /* ` */) {
          if (params.indexOf(String.fromCharCode(marker)) >= 0) {
            return false;
          }
        }
      
        // Since start is found, we can report success here in validation mode
        if (silent) { return true; }
      
        // search end of block
        nextLine = startLine;
      
        for (;;) {
          nextLine++;
          if (nextLine >= endLine) {
            // unclosed block should be autoclosed by end of document.
            // also block seems to be autoclosed by end of parent
            break;
          }
      
          pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
          max = state.eMarks[nextLine];
      
          if (pos < max && state.sCount[nextLine] < state.blkIndent) {
            // non-empty line with negative indent should stop the list:
            // - ```
            //  test
            break;
          }
      
          if (state.src.charCodeAt(pos) !== marker) { continue; }
      
          if (state.sCount[nextLine] - state.blkIndent >= 4) {
            // closing fence should be indented less than 4 spaces
            continue;
          }
      
          pos = state.skipChars(pos, marker);
      
          // closing code fence must be at least as long as the opening one
          if (pos - mem < len) { continue; }
      
          // make sure tail has spaces only
          pos = state.skipSpaces(pos);
      
          if (pos < max) { continue; }
      
          haveEndMarker = true;
          // found!
          break;
        }
      
        // If a fence has heading spaces, they should be removed from its inner block
        len = state.sCount[startLine];
      
        state.line = nextLine + (haveEndMarker ? 1 : 0);
      
        token         = state.push('fence', 'code', 0);
        token.info    = params;
        token.content = state.getLines(startLine + 1, nextLine, len, true);
        token.markup  = markup;
        token.map     = [ startLine, state.line ];
      
        return true;
      };
      
      },{}],21:[function(require,module,exports){
      
      var isSpace = require('../common/utils').isSpace;
      
      
      module.exports = function heading(state, startLine, endLine, silent) {
        var ch, level, tmp, token,
            pos = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine];
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        ch  = state.src.charCodeAt(pos);
      
        if (ch !== 0x23/* # */ || pos >= max) { return false; }
      
        // count heading level
        level = 1;
        ch = state.src.charCodeAt(++pos);
        while (ch === 0x23/* # */ && pos < max && level <= 6) {
          level++;
          ch = state.src.charCodeAt(++pos);
        }
      
        if (level > 6 || (pos < max && !isSpace(ch))) { return false; }
      
        if (silent) { return true; }
      
        // Let's cut tails like '    ###  ' from the end of string
      
        max = state.skipSpacesBack(max, pos);
        tmp = state.skipCharsBack(max, 0x23, pos); // #
        if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) {
          max = tmp;
        }
      
        state.line = startLine + 1;
      
        token        = state.push('heading_open', 'h' + String(level), 1);
        token.markup = '########'.slice(0, level);
        token.map    = [ startLine, state.line ];
      
        token          = state.push('inline', '', 0);
        token.content  = state.src.slice(pos, max).trim();
        token.map      = [ startLine, state.line ];
        token.children = [];
      
        token        = state.push('heading_close', 'h' + String(level), -1);
        token.markup = '########'.slice(0, level);
      
        return true;
      };
      
      },{"../common/utils":4}],22:[function(require,module,exports){
      
      var isSpace = require('../common/utils').isSpace;
      
      
      module.exports = function hr(state, startLine, endLine, silent) {
        var marker, cnt, ch, token,
            pos = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine];
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        marker = state.src.charCodeAt(pos++);
      
        // Check hr marker
        if (marker !== 0x2A/* * */ &&
            marker !== 0x2D/* - */ &&
            marker !== 0x5F/* _ */) {
          return false;
        }
      
        // markers can be mixed with spaces, but there should be at least 3 of them
      
        cnt = 1;
        while (pos < max) {
          ch = state.src.charCodeAt(pos++);
          if (ch !== marker && !isSpace(ch)) { return false; }
          if (ch === marker) { cnt++; }
        }
      
        if (cnt < 3) { return false; }
      
        if (silent) { return true; }
      
        state.line = startLine + 1;
      
        token        = state.push('hr', 'hr', 0);
        token.map    = [ startLine, state.line ];
        token.markup = Array(cnt + 1).join(String.fromCharCode(marker));
      
        return true;
      };
      
      },{"../common/utils":4}],23:[function(require,module,exports){
      
      
      var block_names = require('../common/html_blocks');
      var HTML_OPEN_CLOSE_TAG_RE = require('../common/html_re').HTML_OPEN_CLOSE_TAG_RE;
      
      // An array of opening and corresponding closing sequences for html tags,
      // last argument defines whether it can terminate a paragraph or not
      //
      var HTML_SEQUENCES = [
        [ /^<(script|pre|style)(?=(\s|>|$))/i, /<\/(script|pre|style)>/i, true ],
        [ /^<!--/,        /-->/,   true ],
        [ /^<\?/,         /\?>/,   true ],
        [ /^<![A-Z]/,     />/,     true ],
        [ /^<!\[CDATA\[/, /\]\]>/, true ],
        [ new RegExp('^</?(' + block_names.join('|') + ')(?=(\\s|/?>|$))', 'i'), /^$/, true ],
        [ new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + '\\s*$'),  /^$/, false ]
      ];
      
      
      module.exports = function html_block(state, startLine, endLine, silent) {
        var i, nextLine, token, lineText,
            pos = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine];
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        if (!state.md.options.html) { return false; }
      
        if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false; }
      
        lineText = state.src.slice(pos, max);
      
        for (i = 0; i < HTML_SEQUENCES.length; i++) {
          if (HTML_SEQUENCES[i][0].test(lineText)) { break; }
        }
      
        if (i === HTML_SEQUENCES.length) { return false; }
      
        if (silent) {
          // true if this sequence can be a terminator, false otherwise
          return HTML_SEQUENCES[i][2];
        }
      
        nextLine = startLine + 1;
      
        // If we are here - we detected HTML block.
        // Let's roll down till block end.
        if (!HTML_SEQUENCES[i][1].test(lineText)) {
          for (; nextLine < endLine; nextLine++) {
            if (state.sCount[nextLine] < state.blkIndent) { break; }
      
            pos = state.bMarks[nextLine] + state.tShift[nextLine];
            max = state.eMarks[nextLine];
            lineText = state.src.slice(pos, max);
      
            if (HTML_SEQUENCES[i][1].test(lineText)) {
              if (lineText.length !== 0) { nextLine++; }
              break;
            }
          }
        }
      
        state.line = nextLine;
      
        token         = state.push('html_block', '', 0);
        token.map     = [ startLine, nextLine ];
        token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
      
        return true;
      };
      
      },{"../common/html_blocks":2,"../common/html_re":3}],24:[function(require,module,exports){
      
      
      module.exports = function lheading(state, startLine, endLine/*, silent*/) {
        var content, terminate, i, l, token, pos, max, level, marker,
            nextLine = startLine + 1, oldParentType,
            terminatorRules = state.md.block.ruler.getRules('paragraph');
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        oldParentType = state.parentType;
        state.parentType = 'paragraph'; // use paragraph to match terminatorRules
      
        // jump line-by-line until empty one or EOF
        for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
          // this would be a code block normally, but after paragraph
          // it's considered a lazy continuation regardless of what's there
          if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }
      
          //
          // Check for underline in setext header
          //
          if (state.sCount[nextLine] >= state.blkIndent) {
            pos = state.bMarks[nextLine] + state.tShift[nextLine];
            max = state.eMarks[nextLine];
      
            if (pos < max) {
              marker = state.src.charCodeAt(pos);
      
              if (marker === 0x2D/* - */ || marker === 0x3D/* = */) {
                pos = state.skipChars(pos, marker);
                pos = state.skipSpaces(pos);
      
                if (pos >= max) {
                  level = (marker === 0x3D/* = */ ? 1 : 2);
                  break;
                }
              }
            }
          }
      
          // quirk for blockquotes, this line should already be checked by that rule
          if (state.sCount[nextLine] < 0) { continue; }
      
          // Some tags can terminate paragraph without empty line.
          terminate = false;
          for (i = 0, l = terminatorRules.length; i < l; i++) {
            if (terminatorRules[i](state, nextLine, endLine, true)) {
              terminate = true;
              break;
            }
          }
          if (terminate) { break; }
        }
      
        if (!level) {
          // Didn't find valid underline
          return false;
        }
      
        content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
      
        state.line = nextLine + 1;
      
        token          = state.push('heading_open', 'h' + String(level), 1);
        token.markup   = String.fromCharCode(marker);
        token.map      = [ startLine, state.line ];
      
        token          = state.push('inline', '', 0);
        token.content  = content;
        token.map      = [ startLine, state.line - 1 ];
        token.children = [];
      
        token          = state.push('heading_close', 'h' + String(level), -1);
        token.markup   = String.fromCharCode(marker);
      
        state.parentType = oldParentType;
      
        return true;
      };
      
      },{}],25:[function(require,module,exports){
      
      var isSpace = require('../common/utils').isSpace;
      
      
      // Search `[-+*][\n ]`, returns next pos after marker on success
      // or -1 on fail.
      function skipBulletListMarker(state, startLine) {
        var marker, pos, max, ch;
      
        pos = state.bMarks[startLine] + state.tShift[startLine];
        max = state.eMarks[startLine];
      
        marker = state.src.charCodeAt(pos++);
        // Check bullet
        if (marker !== 0x2A/* * */ &&
            marker !== 0x2D/* - */ &&
            marker !== 0x2B/* + */) {
          return -1;
        }
      
        if (pos < max) {
          ch = state.src.charCodeAt(pos);
      
          if (!isSpace(ch)) {
            // " -test " - is not a list item
            return -1;
          }
        }
      
        return pos;
      }
      
      // Search `\d+[.)][\n ]`, returns next pos after marker on success
      // or -1 on fail.
      function skipOrderedListMarker(state, startLine) {
        var ch,
            start = state.bMarks[startLine] + state.tShift[startLine],
            pos = start,
            max = state.eMarks[startLine];
      
        // List marker should have at least 2 chars (digit + dot)
        if (pos + 1 >= max) { return -1; }
      
        ch = state.src.charCodeAt(pos++);
      
        if (ch < 0x30/* 0 */ || ch > 0x39/* 9 */) { return -1; }
      
        for (;;) {
          // EOL -> fail
          if (pos >= max) { return -1; }
      
          ch = state.src.charCodeAt(pos++);
      
          if (ch >= 0x30/* 0 */ && ch <= 0x39/* 9 */) {
      
            // List marker should have no more than 9 digits
            // (prevents integer overflow in browsers)
            if (pos - start >= 10) { return -1; }
      
            continue;
          }
      
          // found valid marker
          if (ch === 0x29/* ) */ || ch === 0x2e/* . */) {
            break;
          }
      
          return -1;
        }
      
      
        if (pos < max) {
          ch = state.src.charCodeAt(pos);
      
          if (!isSpace(ch)) {
            // " 1.test " - is not a list item
            return -1;
          }
        }
        return pos;
      }
      
      function markTightParagraphs(state, idx) {
        var i, l,
            level = state.level + 2;
      
        for (i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
          if (state.tokens[i].level === level && state.tokens[i].type === 'paragraph_open') {
            state.tokens[i + 2].hidden = true;
            state.tokens[i].hidden = true;
            i += 2;
          }
        }
      }
      
      
      module.exports = function list(state, startLine, endLine, silent) {
        var ch,
            contentStart,
            i,
            indent,
            indentAfterMarker,
            initial,
            isOrdered,
            itemLines,
            l,
            listLines,
            listTokIdx,
            markerCharCode,
            markerValue,
            max,
            nextLine,
            offset,
            oldListIndent,
            oldParentType,
            oldSCount,
            oldTShift,
            oldTight,
            pos,
            posAfterMarker,
            prevEmptyEnd,
            start,
            terminate,
            terminatorRules,
            token,
            isTerminatingParagraph = false,
            tight = true;
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        // Special case:
        //  - item 1
        //   - item 2
        //    - item 3
        //     - item 4
        //      - this one is a paragraph continuation
        if (state.listIndent >= 0 &&
            state.sCount[startLine] - state.listIndent >= 4 &&
            state.sCount[startLine] < state.blkIndent) {
          return false;
        }
      
        // limit conditions when list can interrupt
        // a paragraph (validation mode only)
        if (silent && state.parentType === 'paragraph') {
          // Next list item should still terminate previous list item;
          //
          // This code can fail if plugins use blkIndent as well as lists,
          // but I hope the spec gets fixed long before that happens.
          //
          if (state.tShift[startLine] >= state.blkIndent) {
            isTerminatingParagraph = true;
          }
        }
      
        // Detect list type and position after marker
        if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
          isOrdered = true;
          start = state.bMarks[startLine] + state.tShift[startLine];
          markerValue = Number(state.src.substr(start, posAfterMarker - start - 1));
      
          // If we're starting a new ordered list right after
          // a paragraph, it should start with 1.
          if (isTerminatingParagraph && markerValue !== 1) return false;
      
        } else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
          isOrdered = false;
      
        } else {
          return false;
        }
      
        // If we're starting a new unordered list right after
        // a paragraph, first line should not be empty.
        if (isTerminatingParagraph) {
          if (state.skipSpaces(posAfterMarker) >= state.eMarks[startLine]) return false;
        }
      
        // We should terminate list on style change. Remember first one to compare.
        markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
      
        // For validation mode we can terminate immediately
        if (silent) { return true; }
      
        // Start list
        listTokIdx = state.tokens.length;
      
        if (isOrdered) {
          token       = state.push('ordered_list_open', 'ol', 1);
          if (markerValue !== 1) {
            token.attrs = [ [ 'start', markerValue ] ];
          }
      
        } else {
          token       = state.push('bullet_list_open', 'ul', 1);
        }
      
        token.map    = listLines = [ startLine, 0 ];
        token.markup = String.fromCharCode(markerCharCode);
      
        //
        // Iterate list items
        //
      
        nextLine = startLine;
        prevEmptyEnd = false;
        terminatorRules = state.md.block.ruler.getRules('list');
      
        oldParentType = state.parentType;
        state.parentType = 'list';
      
        while (nextLine < endLine) {
          pos = posAfterMarker;
          max = state.eMarks[nextLine];
      
          initial = offset = state.sCount[nextLine] + posAfterMarker - (state.bMarks[startLine] + state.tShift[startLine]);
      
          while (pos < max) {
            ch = state.src.charCodeAt(pos);
      
            if (ch === 0x09) {
              offset += 4 - (offset + state.bsCount[nextLine]) % 4;
            } else if (ch === 0x20) {
              offset++;
            } else {
              break;
            }
      
            pos++;
          }
      
          contentStart = pos;
      
          if (contentStart >= max) {
            // trimming space in "-    \n  3" case, indent is 1 here
            indentAfterMarker = 1;
          } else {
            indentAfterMarker = offset - initial;
          }
      
          // If we have more than 4 spaces, the indent is 1
          // (the rest is just indented code block)
          if (indentAfterMarker > 4) { indentAfterMarker = 1; }
      
          // "  -  test"
          //  ^^^^^ - calculating total length of this thing
          indent = initial + indentAfterMarker;
      
          // Run subparser & write tokens
          token        = state.push('list_item_open', 'li', 1);
          token.markup = String.fromCharCode(markerCharCode);
          token.map    = itemLines = [ startLine, 0 ];
      
          // change current state, then restore it after parser subcall
          oldTight = state.tight;
          oldTShift = state.tShift[startLine];
          oldSCount = state.sCount[startLine];
      
          //  - example list
          // ^ listIndent position will be here
          //   ^ blkIndent position will be here
          //
          oldListIndent = state.listIndent;
          state.listIndent = state.blkIndent;
          state.blkIndent = indent;
      
          state.tight = true;
          state.tShift[startLine] = contentStart - state.bMarks[startLine];
          state.sCount[startLine] = offset;
      
          if (contentStart >= max && state.isEmpty(startLine + 1)) {
            // workaround for this case
            // (list item is empty, list terminates before "foo"):
            // ~~~~~~~~
            //   -
            //
            //     foo
            // ~~~~~~~~
            state.line = Math.min(state.line + 2, endLine);
          } else {
            state.md.block.tokenize(state, startLine, endLine, true);
          }
      
          // If any of list item is tight, mark list as tight
          if (!state.tight || prevEmptyEnd) {
            tight = false;
          }
          // Item become loose if finish with empty line,
          // but we should filter last element, because it means list finish
          prevEmptyEnd = (state.line - startLine) > 1 && state.isEmpty(state.line - 1);
      
          state.blkIndent = state.listIndent;
          state.listIndent = oldListIndent;
          state.tShift[startLine] = oldTShift;
          state.sCount[startLine] = oldSCount;
          state.tight = oldTight;
      
          token        = state.push('list_item_close', 'li', -1);
          token.markup = String.fromCharCode(markerCharCode);
      
          nextLine = startLine = state.line;
          itemLines[1] = nextLine;
          contentStart = state.bMarks[startLine];
      
          if (nextLine >= endLine) { break; }
      
          //
          // Try to check if list is terminated or continued.
          //
          if (state.sCount[nextLine] < state.blkIndent) { break; }
      
          // if it's indented more than 3 spaces, it should be a code block
          if (state.sCount[startLine] - state.blkIndent >= 4) { break; }
      
          // fail if terminating block found
          terminate = false;
          for (i = 0, l = terminatorRules.length; i < l; i++) {
            if (terminatorRules[i](state, nextLine, endLine, true)) {
              terminate = true;
              break;
            }
          }
          if (terminate) { break; }
      
          // fail if list has another type
          if (isOrdered) {
            posAfterMarker = skipOrderedListMarker(state, nextLine);
            if (posAfterMarker < 0) { break; }
          } else {
            posAfterMarker = skipBulletListMarker(state, nextLine);
            if (posAfterMarker < 0) { break; }
          }
      
          if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) { break; }
        }
      
        // Finalize list
        if (isOrdered) {
          token = state.push('ordered_list_close', 'ol', -1);
        } else {
          token = state.push('bullet_list_close', 'ul', -1);
        }
        token.markup = String.fromCharCode(markerCharCode);
      
        listLines[1] = nextLine;
        state.line = nextLine;
      
        state.parentType = oldParentType;
      
        // mark paragraphs tight if needed
        if (tight) {
          markTightParagraphs(state, listTokIdx);
        }
      
        return true;
      };
      
      },{"../common/utils":4}],26:[function(require,module,exports){
      
      
      module.exports = function paragraph(state, startLine/*, endLine*/) {
        var content, terminate, i, l, token, oldParentType,
            nextLine = startLine + 1,
            terminatorRules = state.md.block.ruler.getRules('paragraph'),
            endLine = state.lineMax;
      
        oldParentType = state.parentType;
        state.parentType = 'paragraph';
      
        // jump line-by-line until empty one or EOF
        for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
          // this would be a code block normally, but after paragraph
          // it's considered a lazy continuation regardless of what's there
          if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }
      
          // quirk for blockquotes, this line should already be checked by that rule
          if (state.sCount[nextLine] < 0) { continue; }
      
          // Some tags can terminate paragraph without empty line.
          terminate = false;
          for (i = 0, l = terminatorRules.length; i < l; i++) {
            if (terminatorRules[i](state, nextLine, endLine, true)) {
              terminate = true;
              break;
            }
          }
          if (terminate) { break; }
        }
      
        content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
      
        state.line = nextLine;
      
        token          = state.push('paragraph_open', 'p', 1);
        token.map      = [ startLine, state.line ];
      
        token          = state.push('inline', '', 0);
        token.content  = content;
        token.map      = [ startLine, state.line ];
        token.children = [];
      
        token          = state.push('paragraph_close', 'p', -1);
      
        state.parentType = oldParentType;
      
        return true;
      };
      
      },{}],27:[function(require,module,exports){
      
      
      var normalizeReference   = require('../common/utils').normalizeReference;
      var isSpace              = require('../common/utils').isSpace;
      
      
      module.exports = function reference(state, startLine, _endLine, silent) {
        var ch,
            destEndPos,
            destEndLineNo,
            endLine,
            href,
            i,
            l,
            label,
            labelEnd,
            oldParentType,
            res,
            start,
            str,
            terminate,
            terminatorRules,
            title,
            lines = 0,
            pos = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine],
            nextLine = startLine + 1;
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      
        if (state.src.charCodeAt(pos) !== 0x5B/* [ */) { return false; }
      
        // Simple check to quickly interrupt scan on [link](url) at the start of line.
        // Can be useful on practice: https://github.com/markdown-it/markdown-it/issues/54
        while (++pos < max) {
          if (state.src.charCodeAt(pos) === 0x5D /* ] */ &&
              state.src.charCodeAt(pos - 1) !== 0x5C/* \ */) {
            if (pos + 1 === max) { return false; }
            if (state.src.charCodeAt(pos + 1) !== 0x3A/* : */) { return false; }
            break;
          }
        }
      
        endLine = state.lineMax;
      
        // jump line-by-line until empty one or EOF
        terminatorRules = state.md.block.ruler.getRules('reference');
      
        oldParentType = state.parentType;
        state.parentType = 'reference';
      
        for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
          // this would be a code block normally, but after paragraph
          // it's considered a lazy continuation regardless of what's there
          if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }
      
          // quirk for blockquotes, this line should already be checked by that rule
          if (state.sCount[nextLine] < 0) { continue; }
      
          // Some tags can terminate paragraph without empty line.
          terminate = false;
          for (i = 0, l = terminatorRules.length; i < l; i++) {
            if (terminatorRules[i](state, nextLine, endLine, true)) {
              terminate = true;
              break;
            }
          }
          if (terminate) { break; }
        }
      
        str = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
        max = str.length;
      
        for (pos = 1; pos < max; pos++) {
          ch = str.charCodeAt(pos);
          if (ch === 0x5B /* [ */) {
            return false;
          } else if (ch === 0x5D /* ] */) {
            labelEnd = pos;
            break;
          } else if (ch === 0x0A /* \n */) {
            lines++;
          } else if (ch === 0x5C /* \ */) {
            pos++;
            if (pos < max && str.charCodeAt(pos) === 0x0A) {
              lines++;
            }
          }
        }
      
        if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 0x3A/* : */) { return false; }
      
        // [label]:   destination   'title'
        //         ^^^ skip optional whitespace here
        for (pos = labelEnd + 2; pos < max; pos++) {
          ch = str.charCodeAt(pos);
          if (ch === 0x0A) {
            lines++;
          } else if (isSpace(ch)) ; else {
            break;
          }
        }
      
        // [label]:   destination   'title'
        //            ^^^^^^^^^^^ parse this
        res = state.md.helpers.parseLinkDestination(str, pos, max);
        if (!res.ok) { return false; }
      
        href = state.md.normalizeLink(res.str);
        if (!state.md.validateLink(href)) { return false; }
      
        pos = res.pos;
        lines += res.lines;
      
        // save cursor state, we could require to rollback later
        destEndPos = pos;
        destEndLineNo = lines;
      
        // [label]:   destination   'title'
        //                       ^^^ skipping those spaces
        start = pos;
        for (; pos < max; pos++) {
          ch = str.charCodeAt(pos);
          if (ch === 0x0A) {
            lines++;
          } else if (isSpace(ch)) ; else {
            break;
          }
        }
      
        // [label]:   destination   'title'
        //                          ^^^^^^^ parse this
        res = state.md.helpers.parseLinkTitle(str, pos, max);
        if (pos < max && start !== pos && res.ok) {
          title = res.str;
          pos = res.pos;
          lines += res.lines;
        } else {
          title = '';
          pos = destEndPos;
          lines = destEndLineNo;
        }
      
        // skip trailing spaces until the rest of the line
        while (pos < max) {
          ch = str.charCodeAt(pos);
          if (!isSpace(ch)) { break; }
          pos++;
        }
      
        if (pos < max && str.charCodeAt(pos) !== 0x0A) {
          if (title) {
            // garbage at the end of the line after title,
            // but it could still be a valid reference if we roll back
            title = '';
            pos = destEndPos;
            lines = destEndLineNo;
            while (pos < max) {
              ch = str.charCodeAt(pos);
              if (!isSpace(ch)) { break; }
              pos++;
            }
          }
        }
      
        if (pos < max && str.charCodeAt(pos) !== 0x0A) {
          // garbage at the end of the line
          return false;
        }
      
        label = normalizeReference(str.slice(1, labelEnd));
        if (!label) {
          // CommonMark 0.20 disallows empty labels
          return false;
        }
      
        // Reference can not terminate anything. This check is for safety only.
        /*istanbul ignore if*/
        if (silent) { return true; }
      
        if (typeof state.env.references === 'undefined') {
          state.env.references = {};
        }
        if (typeof state.env.references[label] === 'undefined') {
          state.env.references[label] = { title: title, href: href };
        }
      
        state.parentType = oldParentType;
      
        state.line = startLine + lines + 1;
        return true;
      };
      
      },{"../common/utils":4}],28:[function(require,module,exports){
      
      var Token = require('../token');
      var isSpace = require('../common/utils').isSpace;
      
      
      function StateBlock(src, md, env, tokens) {
        var ch, s, start, pos, len, indent, offset, indent_found;
      
        this.src = src;
      
        // link to parser instance
        this.md     = md;
      
        this.env = env;
      
        //
        // Internal state vartiables
        //
      
        this.tokens = tokens;
      
        this.bMarks = [];  // line begin offsets for fast jumps
        this.eMarks = [];  // line end offsets for fast jumps
        this.tShift = [];  // offsets of the first non-space characters (tabs not expanded)
        this.sCount = [];  // indents for each line (tabs expanded)
      
        // An amount of virtual spaces (tabs expanded) between beginning
        // of each line (bMarks) and real beginning of that line.
        //
        // It exists only as a hack because blockquotes override bMarks
        // losing information in the process.
        //
        // It's used only when expanding tabs, you can think about it as
        // an initial tab length, e.g. bsCount=21 applied to string `\t123`
        // means first tab should be expanded to 4-21%4 === 3 spaces.
        //
        this.bsCount = [];
      
        // block parser variables
        this.blkIndent  = 0; // required block content indent (for example, if we are
                             // inside a list, it would be positioned after list marker)
        this.line       = 0; // line index in src
        this.lineMax    = 0; // lines count
        this.tight      = false;  // loose/tight mode for lists
        this.ddIndent   = -1; // indent of the current dd block (-1 if there isn't any)
        this.listIndent = -1; // indent of the current list block (-1 if there isn't any)
      
        // can be 'blockquote', 'list', 'root', 'paragraph' or 'reference'
        // used in lists to determine if they interrupt a paragraph
        this.parentType = 'root';
      
        this.level = 0;
      
        // renderer
        this.result = '';
      
        // Create caches
        // Generate markers.
        s = this.src;
        indent_found = false;
      
        for (start = pos = indent = offset = 0, len = s.length; pos < len; pos++) {
          ch = s.charCodeAt(pos);
      
          if (!indent_found) {
            if (isSpace(ch)) {
              indent++;
      
              if (ch === 0x09) {
                offset += 4 - offset % 4;
              } else {
                offset++;
              }
              continue;
            } else {
              indent_found = true;
            }
          }
      
          if (ch === 0x0A || pos === len - 1) {
            if (ch !== 0x0A) { pos++; }
            this.bMarks.push(start);
            this.eMarks.push(pos);
            this.tShift.push(indent);
            this.sCount.push(offset);
            this.bsCount.push(0);
      
            indent_found = false;
            indent = 0;
            offset = 0;
            start = pos + 1;
          }
        }
      
        // Push fake entry to simplify cache bounds checks
        this.bMarks.push(s.length);
        this.eMarks.push(s.length);
        this.tShift.push(0);
        this.sCount.push(0);
        this.bsCount.push(0);
      
        this.lineMax = this.bMarks.length - 1; // don't count last fake line
      }
      
      // Push new token to "stream".
      //
      StateBlock.prototype.push = function (type, tag, nesting) {
        var token = new Token(type, tag, nesting);
        token.block = true;
      
        if (nesting < 0) this.level--; // closing tag
        token.level = this.level;
        if (nesting > 0) this.level++; // opening tag
      
        this.tokens.push(token);
        return token;
      };
      
      StateBlock.prototype.isEmpty = function isEmpty(line) {
        return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
      };
      
      StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
        for (var max = this.lineMax; from < max; from++) {
          if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
            break;
          }
        }
        return from;
      };
      
      // Skip spaces from given position.
      StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
        var ch;
      
        for (var max = this.src.length; pos < max; pos++) {
          ch = this.src.charCodeAt(pos);
          if (!isSpace(ch)) { break; }
        }
        return pos;
      };
      
      // Skip spaces from given position in reverse.
      StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
        if (pos <= min) { return pos; }
      
        while (pos > min) {
          if (!isSpace(this.src.charCodeAt(--pos))) { return pos + 1; }
        }
        return pos;
      };
      
      // Skip char codes from given position
      StateBlock.prototype.skipChars = function skipChars(pos, code) {
        for (var max = this.src.length; pos < max; pos++) {
          if (this.src.charCodeAt(pos) !== code) { break; }
        }
        return pos;
      };
      
      // Skip char codes reverse from given position - 1
      StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code, min) {
        if (pos <= min) { return pos; }
      
        while (pos > min) {
          if (code !== this.src.charCodeAt(--pos)) { return pos + 1; }
        }
        return pos;
      };
      
      // cut lines range from source.
      StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
        var i, lineIndent, ch, first, last, queue, lineStart,
            line = begin;
      
        if (begin >= end) {
          return '';
        }
      
        queue = new Array(end - begin);
      
        for (i = 0; line < end; line++, i++) {
          lineIndent = 0;
          lineStart = first = this.bMarks[line];
      
          if (line + 1 < end || keepLastLF) {
            // No need for bounds check because we have fake entry on tail.
            last = this.eMarks[line] + 1;
          } else {
            last = this.eMarks[line];
          }
      
          while (first < last && lineIndent < indent) {
            ch = this.src.charCodeAt(first);
      
            if (isSpace(ch)) {
              if (ch === 0x09) {
                lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
              } else {
                lineIndent++;
              }
            } else if (first - lineStart < this.tShift[line]) {
              // patched tShift masked characters to look like spaces (blockquotes, list markers)
              lineIndent++;
            } else {
              break;
            }
      
            first++;
          }
      
          if (lineIndent > indent) {
            // partially expanding tabs in code blocks, e.g '\t\tfoobar'
            // with indent=2 becomes '  \tfoobar'
            queue[i] = new Array(lineIndent - indent + 1).join(' ') + this.src.slice(first, last);
          } else {
            queue[i] = this.src.slice(first, last);
          }
        }
      
        return queue.join('');
      };
      
      // re-export Token class to use in block rules
      StateBlock.prototype.Token = Token;
      
      
      module.exports = StateBlock;
      
      },{"../common/utils":4,"../token":51}],29:[function(require,module,exports){
      
      var isSpace = require('../common/utils').isSpace;
      
      
      function getLine(state, line) {
        var pos = state.bMarks[line] + state.blkIndent,
            max = state.eMarks[line];
      
        return state.src.substr(pos, max - pos);
      }
      
      function escapedSplit(str) {
        var result = [],
            pos = 0,
            max = str.length,
            ch,
            escapes = 0,
            lastPos = 0,
            backTicked = false,
            lastBackTick = 0;
      
        ch  = str.charCodeAt(pos);
      
        while (pos < max) {
          if (ch === 0x60/* ` */) {
            if (backTicked) {
              // make \` close code sequence, but not open it;
              // the reason is: `\` is correct code block
              backTicked = false;
              lastBackTick = pos;
            } else if (escapes % 2 === 0) {
              backTicked = true;
              lastBackTick = pos;
            }
          } else if (ch === 0x7c/* | */ && (escapes % 2 === 0) && !backTicked) {
            result.push(str.substring(lastPos, pos));
            lastPos = pos + 1;
          }
      
          if (ch === 0x5c/* \ */) {
            escapes++;
          } else {
            escapes = 0;
          }
      
          pos++;
      
          // If there was an un-closed backtick, go back to just after
          // the last backtick, but as if it was a normal character
          if (pos === max && backTicked) {
            backTicked = false;
            pos = lastBackTick + 1;
          }
      
          ch = str.charCodeAt(pos);
        }
      
        result.push(str.substring(lastPos));
      
        return result;
      }
      
      
      module.exports = function table(state, startLine, endLine, silent) {
        var ch, lineText, pos, i, nextLine, columns, columnCount, token,
            aligns, t, tableLines, tbodyLines;
      
        // should have at least two lines
        if (startLine + 2 > endLine) { return false; }
      
        nextLine = startLine + 1;
      
        if (state.sCount[nextLine] < state.blkIndent) { return false; }
      
        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[nextLine] - state.blkIndent >= 4) { return false; }
      
        // first character of the second line should be '|', '-', ':',
        // and no other characters are allowed but spaces;
        // basically, this is the equivalent of /^[-:|][-:|\s]*$/ regexp
      
        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        if (pos >= state.eMarks[nextLine]) { return false; }
      
        ch = state.src.charCodeAt(pos++);
        if (ch !== 0x7C/* | */ && ch !== 0x2D/* - */ && ch !== 0x3A/* : */) { return false; }
      
        while (pos < state.eMarks[nextLine]) {
          ch = state.src.charCodeAt(pos);
      
          if (ch !== 0x7C/* | */ && ch !== 0x2D/* - */ && ch !== 0x3A/* : */ && !isSpace(ch)) { return false; }
      
          pos++;
        }
      
        lineText = getLine(state, startLine + 1);
      
        columns = lineText.split('|');
        aligns = [];
        for (i = 0; i < columns.length; i++) {
          t = columns[i].trim();
          if (!t) {
            // allow empty columns before and after table, but not in between columns;
            // e.g. allow ` |---| `, disallow ` ---||--- `
            if (i === 0 || i === columns.length - 1) {
              continue;
            } else {
              return false;
            }
          }
      
          if (!/^:?-+:?$/.test(t)) { return false; }
          if (t.charCodeAt(t.length - 1) === 0x3A/* : */) {
            aligns.push(t.charCodeAt(0) === 0x3A/* : */ ? 'center' : 'right');
          } else if (t.charCodeAt(0) === 0x3A/* : */) {
            aligns.push('left');
          } else {
            aligns.push('');
          }
        }
      
        lineText = getLine(state, startLine).trim();
        if (lineText.indexOf('|') === -1) { return false; }
        if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
        columns = escapedSplit(lineText.replace(/^\||\|$/g, ''));
      
        // header row will define an amount of columns in the entire table,
        // and align row shouldn't be smaller than that (the rest of the rows can)
        columnCount = columns.length;
        if (columnCount > aligns.length) { return false; }
      
        if (silent) { return true; }
      
        token     = state.push('table_open', 'table', 1);
        token.map = tableLines = [ startLine, 0 ];
      
        token     = state.push('thead_open', 'thead', 1);
        token.map = [ startLine, startLine + 1 ];
      
        token     = state.push('tr_open', 'tr', 1);
        token.map = [ startLine, startLine + 1 ];
      
        for (i = 0; i < columns.length; i++) {
          token          = state.push('th_open', 'th', 1);
          token.map      = [ startLine, startLine + 1 ];
          if (aligns[i]) {
            token.attrs  = [ [ 'style', 'text-align:' + aligns[i] ] ];
          }
      
          token          = state.push('inline', '', 0);
          token.content  = columns[i].trim();
          token.map      = [ startLine, startLine + 1 ];
          token.children = [];
      
          token          = state.push('th_close', 'th', -1);
        }
      
        token     = state.push('tr_close', 'tr', -1);
        token     = state.push('thead_close', 'thead', -1);
      
        token     = state.push('tbody_open', 'tbody', 1);
        token.map = tbodyLines = [ startLine + 2, 0 ];
      
        for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
          if (state.sCount[nextLine] < state.blkIndent) { break; }
      
          lineText = getLine(state, nextLine).trim();
          if (lineText.indexOf('|') === -1) { break; }
          if (state.sCount[nextLine] - state.blkIndent >= 4) { break; }
          columns = escapedSplit(lineText.replace(/^\||\|$/g, ''));
      
          token = state.push('tr_open', 'tr', 1);
          for (i = 0; i < columnCount; i++) {
            token          = state.push('td_open', 'td', 1);
            if (aligns[i]) {
              token.attrs  = [ [ 'style', 'text-align:' + aligns[i] ] ];
            }
      
            token          = state.push('inline', '', 0);
            token.content  = columns[i] ? columns[i].trim() : '';
            token.children = [];
      
            token          = state.push('td_close', 'td', -1);
          }
          token = state.push('tr_close', 'tr', -1);
        }
        token = state.push('tbody_close', 'tbody', -1);
        token = state.push('table_close', 'table', -1);
      
        tableLines[1] = tbodyLines[1] = nextLine;
        state.line = nextLine;
        return true;
      };
      
      },{"../common/utils":4}],30:[function(require,module,exports){
      
      
      module.exports = function block(state) {
        var token;
      
        if (state.inlineMode) {
          token          = new state.Token('inline', '', 0);
          token.content  = state.src;
          token.map      = [ 0, 1 ];
          token.children = [];
          state.tokens.push(token);
        } else {
          state.md.block.parse(state.src, state.md, state.env, state.tokens);
        }
      };
      
      },{}],31:[function(require,module,exports){
      
      module.exports = function inline(state) {
        var tokens = state.tokens, tok, i, l;
      
        // Parse inlines
        for (i = 0, l = tokens.length; i < l; i++) {
          tok = tokens[i];
          if (tok.type === 'inline') {
            state.md.inline.parse(tok.content, state.md, state.env, tok.children);
          }
        }
      };
      
      },{}],32:[function(require,module,exports){
      
      
      var arrayReplaceAt = require('../common/utils').arrayReplaceAt;
      
      
      function isLinkOpen(str) {
        return /^<a[>\s]/i.test(str);
      }
      function isLinkClose(str) {
        return /^<\/a\s*>/i.test(str);
      }
      
      
      module.exports = function linkify(state) {
        var i, j, l, tokens, token, currentToken, nodes, ln, text, pos, lastPos,
            level, htmlLinkLevel, url, fullUrl, urlText,
            blockTokens = state.tokens,
            links;
      
        if (!state.md.options.linkify) { return; }
      
        for (j = 0, l = blockTokens.length; j < l; j++) {
          if (blockTokens[j].type !== 'inline' ||
              !state.md.linkify.pretest(blockTokens[j].content)) {
            continue;
          }
      
          tokens = blockTokens[j].children;
      
          htmlLinkLevel = 0;
      
          // We scan from the end, to keep position when new tags added.
          // Use reversed logic in links start/end match
          for (i = tokens.length - 1; i >= 0; i--) {
            currentToken = tokens[i];
      
            // Skip content of markdown links
            if (currentToken.type === 'link_close') {
              i--;
              while (tokens[i].level !== currentToken.level && tokens[i].type !== 'link_open') {
                i--;
              }
              continue;
            }
      
            // Skip content of html tag links
            if (currentToken.type === 'html_inline') {
              if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) {
                htmlLinkLevel--;
              }
              if (isLinkClose(currentToken.content)) {
                htmlLinkLevel++;
              }
            }
            if (htmlLinkLevel > 0) { continue; }
      
            if (currentToken.type === 'text' && state.md.linkify.test(currentToken.content)) {
      
              text = currentToken.content;
              links = state.md.linkify.match(text);
      
              // Now split string to nodes
              nodes = [];
              level = currentToken.level;
              lastPos = 0;
      
              for (ln = 0; ln < links.length; ln++) {
      
                url = links[ln].url;
                fullUrl = state.md.normalizeLink(url);
                if (!state.md.validateLink(fullUrl)) { continue; }
      
                urlText = links[ln].text;
      
                // Linkifier might send raw hostnames like "example.com", where url
                // starts with domain name. So we prepend http:// in those cases,
                // and remove it afterwards.
                //
                if (!links[ln].schema) {
                  urlText = state.md.normalizeLinkText('http://' + urlText).replace(/^http:\/\//, '');
                } else if (links[ln].schema === 'mailto:' && !/^mailto:/i.test(urlText)) {
                  urlText = state.md.normalizeLinkText('mailto:' + urlText).replace(/^mailto:/, '');
                } else {
                  urlText = state.md.normalizeLinkText(urlText);
                }
      
                pos = links[ln].index;
      
                if (pos > lastPos) {
                  token         = new state.Token('text', '', 0);
                  token.content = text.slice(lastPos, pos);
                  token.level   = level;
                  nodes.push(token);
                }
      
                token         = new state.Token('link_open', 'a', 1);
                token.attrs   = [ [ 'href', fullUrl ] ];
                token.level   = level++;
                token.markup  = 'linkify';
                token.info    = 'auto';
                nodes.push(token);
      
                token         = new state.Token('text', '', 0);
                token.content = urlText;
                token.level   = level;
                nodes.push(token);
      
                token         = new state.Token('link_close', 'a', -1);
                token.level   = --level;
                token.markup  = 'linkify';
                token.info    = 'auto';
                nodes.push(token);
      
                lastPos = links[ln].lastIndex;
              }
              if (lastPos < text.length) {
                token         = new state.Token('text', '', 0);
                token.content = text.slice(lastPos);
                token.level   = level;
                nodes.push(token);
              }
      
              // replace current node
              blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
            }
          }
        }
      };
      
      },{"../common/utils":4}],33:[function(require,module,exports){
      
      
      // https://spec.commonmark.org/0.29/#line-ending
      var NEWLINES_RE  = /\r\n?|\n/g;
      var NULL_RE      = /\0/g;
      
      
      module.exports = function normalize(state) {
        var str;
      
        // Normalize newlines
        str = state.src.replace(NEWLINES_RE, '\n');
      
        // Replace NULL characters
        str = str.replace(NULL_RE, '\uFFFD');
      
        state.src = str;
      };
      
      },{}],34:[function(require,module,exports){
      
      // TODO:
      // - fractionals 1/2, 1/4, 3/4 -> ½, ¼, ¾
      // - miltiplication 2 x 4 -> 2 × 4
      
      var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
      
      // Workaround for phantomjs - need regex without /g flag,
      // or root check will fail every second time
      var SCOPED_ABBR_TEST_RE = /\((c|tm|r|p)\)/i;
      
      var SCOPED_ABBR_RE = /\((c|tm|r|p)\)/ig;
      var SCOPED_ABBR = {
        c: '©',
        r: '®',
        p: '§',
        tm: '™'
      };
      
      function replaceFn(match, name) {
        return SCOPED_ABBR[name.toLowerCase()];
      }
      
      function replace_scoped(inlineTokens) {
        var i, token, inside_autolink = 0;
      
        for (i = inlineTokens.length - 1; i >= 0; i--) {
          token = inlineTokens[i];
      
          if (token.type === 'text' && !inside_autolink) {
            token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
          }
      
          if (token.type === 'link_open' && token.info === 'auto') {
            inside_autolink--;
          }
      
          if (token.type === 'link_close' && token.info === 'auto') {
            inside_autolink++;
          }
        }
      }
      
      function replace_rare(inlineTokens) {
        var i, token, inside_autolink = 0;
      
        for (i = inlineTokens.length - 1; i >= 0; i--) {
          token = inlineTokens[i];
      
          if (token.type === 'text' && !inside_autolink) {
            if (RARE_RE.test(token.content)) {
              token.content = token.content
                .replace(/\+-/g, '±')
                // .., ..., ....... -> …
                // but ?..... & !..... -> ?.. & !..
                .replace(/\.{2,}/g, '…').replace(/([?!])…/g, '$1..')
                .replace(/([?!]){4,}/g, '$1$1$1').replace(/,{2,}/g, ',')
                // em-dash
                .replace(/(^|[^-])---([^-]|$)/mg, '$1\u2014$2')
                // en-dash
                .replace(/(^|\s)--(\s|$)/mg, '$1\u2013$2')
                .replace(/(^|[^-\s])--([^-\s]|$)/mg, '$1\u2013$2');
            }
          }
      
          if (token.type === 'link_open' && token.info === 'auto') {
            inside_autolink--;
          }
      
          if (token.type === 'link_close' && token.info === 'auto') {
            inside_autolink++;
          }
        }
      }
      
      
      module.exports = function replace(state) {
        var blkIdx;
      
        if (!state.md.options.typographer) { return; }
      
        for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
      
          if (state.tokens[blkIdx].type !== 'inline') { continue; }
      
          if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
            replace_scoped(state.tokens[blkIdx].children);
          }
      
          if (RARE_RE.test(state.tokens[blkIdx].content)) {
            replace_rare(state.tokens[blkIdx].children);
          }
      
        }
      };
      
      },{}],35:[function(require,module,exports){
      
      
      var isWhiteSpace   = require('../common/utils').isWhiteSpace;
      var isPunctChar    = require('../common/utils').isPunctChar;
      var isMdAsciiPunct = require('../common/utils').isMdAsciiPunct;
      
      var QUOTE_TEST_RE = /['"]/;
      var QUOTE_RE = /['"]/g;
      var APOSTROPHE = '\u2019'; /* ’ */
      
      
      function replaceAt(str, index, ch) {
        return str.substr(0, index) + ch + str.substr(index + 1);
      }
      
      function process_inlines(tokens, state) {
        var i, token, text, t, pos, max, thisLevel, item, lastChar, nextChar,
            isLastPunctChar, isNextPunctChar, isLastWhiteSpace, isNextWhiteSpace,
            canOpen, canClose, j, isSingle, stack, openQuote, closeQuote;
      
        stack = [];
      
        for (i = 0; i < tokens.length; i++) {
          token = tokens[i];
      
          thisLevel = tokens[i].level;
      
          for (j = stack.length - 1; j >= 0; j--) {
            if (stack[j].level <= thisLevel) { break; }
          }
          stack.length = j + 1;
      
          if (token.type !== 'text') { continue; }
      
          text = token.content;
          pos = 0;
          max = text.length;
      
          /*eslint no-labels:0,block-scoped-var:0*/
          OUTER:
          while (pos < max) {
            QUOTE_RE.lastIndex = pos;
            t = QUOTE_RE.exec(text);
            if (!t) { break; }
      
            canOpen = canClose = true;
            pos = t.index + 1;
            isSingle = (t[0] === "'");
      
            // Find previous character,
            // default to space if it's the beginning of the line
            //
            lastChar = 0x20;
      
            if (t.index - 1 >= 0) {
              lastChar = text.charCodeAt(t.index - 1);
            } else {
              for (j = i - 1; j >= 0; j--) {
                if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break; // lastChar defaults to 0x20
                if (tokens[j].type !== 'text') continue;
      
                lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
                break;
              }
            }
      
            // Find next character,
            // default to space if it's the end of the line
            //
            nextChar = 0x20;
      
            if (pos < max) {
              nextChar = text.charCodeAt(pos);
            } else {
              for (j = i + 1; j < tokens.length; j++) {
                if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break; // nextChar defaults to 0x20
                if (tokens[j].type !== 'text') continue;
      
                nextChar = tokens[j].content.charCodeAt(0);
                break;
              }
            }
      
            isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
            isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
      
            isLastWhiteSpace = isWhiteSpace(lastChar);
            isNextWhiteSpace = isWhiteSpace(nextChar);
      
            if (isNextWhiteSpace) {
              canOpen = false;
            } else if (isNextPunctChar) {
              if (!(isLastWhiteSpace || isLastPunctChar)) {
                canOpen = false;
              }
            }
      
            if (isLastWhiteSpace) {
              canClose = false;
            } else if (isLastPunctChar) {
              if (!(isNextWhiteSpace || isNextPunctChar)) {
                canClose = false;
              }
            }
      
            if (nextChar === 0x22 /* " */ && t[0] === '"') {
              if (lastChar >= 0x30 /* 0 */ && lastChar <= 0x39 /* 9 */) {
                // special case: 1"" - count first quote as an inch
                canClose = canOpen = false;
              }
            }
      
            if (canOpen && canClose) {
              // treat this as the middle of the word
              canOpen = false;
              canClose = isNextPunctChar;
            }
      
            if (!canOpen && !canClose) {
              // middle of word
              if (isSingle) {
                token.content = replaceAt(token.content, t.index, APOSTROPHE);
              }
              continue;
            }
      
            if (canClose) {
              // this could be a closing quote, rewind the stack to get a match
              for (j = stack.length - 1; j >= 0; j--) {
                item = stack[j];
                if (stack[j].level < thisLevel) { break; }
                if (item.single === isSingle && stack[j].level === thisLevel) {
                  item = stack[j];
      
                  if (isSingle) {
                    openQuote = state.md.options.quotes[2];
                    closeQuote = state.md.options.quotes[3];
                  } else {
                    openQuote = state.md.options.quotes[0];
                    closeQuote = state.md.options.quotes[1];
                  }
      
                  // replace token.content *before* tokens[item.token].content,
                  // because, if they are pointing at the same token, replaceAt
                  // could mess up indices when quote length != 1
                  token.content = replaceAt(token.content, t.index, closeQuote);
                  tokens[item.token].content = replaceAt(
                    tokens[item.token].content, item.pos, openQuote);
      
                  pos += closeQuote.length - 1;
                  if (item.token === i) { pos += openQuote.length - 1; }
      
                  text = token.content;
                  max = text.length;
      
                  stack.length = j;
                  continue OUTER;
                }
              }
            }
      
            if (canOpen) {
              stack.push({
                token: i,
                pos: t.index,
                single: isSingle,
                level: thisLevel
              });
            } else if (canClose && isSingle) {
              token.content = replaceAt(token.content, t.index, APOSTROPHE);
            }
          }
        }
      }
      
      
      module.exports = function smartquotes(state) {
        /*eslint max-depth:0*/
        var blkIdx;
      
        if (!state.md.options.typographer) { return; }
      
        for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
      
          if (state.tokens[blkIdx].type !== 'inline' ||
              !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
            continue;
          }
      
          process_inlines(state.tokens[blkIdx].children, state);
        }
      };
      
      },{"../common/utils":4}],36:[function(require,module,exports){
      
      var Token = require('../token');
      
      
      function StateCore(src, md, env) {
        this.src = src;
        this.env = env;
        this.tokens = [];
        this.inlineMode = false;
        this.md = md; // link to parser instance
      }
      
      // re-export Token class to use in core rules
      StateCore.prototype.Token = Token;
      
      
      module.exports = StateCore;
      
      },{"../token":51}],37:[function(require,module,exports){
      
      
      /*eslint max-len:0*/
      var EMAIL_RE    = /^<([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
      var AUTOLINK_RE = /^<([a-zA-Z][a-zA-Z0-9+.\-]{1,31}):([^<>\x00-\x20]*)>/;
      
      
      module.exports = function autolink(state, silent) {
        var tail, linkMatch, emailMatch, url, fullUrl, token,
            pos = state.pos;
      
        if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false; }
      
        tail = state.src.slice(pos);
      
        if (tail.indexOf('>') < 0) { return false; }
      
        if (AUTOLINK_RE.test(tail)) {
          linkMatch = tail.match(AUTOLINK_RE);
      
          url = linkMatch[0].slice(1, -1);
          fullUrl = state.md.normalizeLink(url);
          if (!state.md.validateLink(fullUrl)) { return false; }
      
          if (!silent) {
            token         = state.push('link_open', 'a', 1);
            token.attrs   = [ [ 'href', fullUrl ] ];
            token.markup  = 'autolink';
            token.info    = 'auto';
      
            token         = state.push('text', '', 0);
            token.content = state.md.normalizeLinkText(url);
      
            token         = state.push('link_close', 'a', -1);
            token.markup  = 'autolink';
            token.info    = 'auto';
          }
      
          state.pos += linkMatch[0].length;
          return true;
        }
      
        if (EMAIL_RE.test(tail)) {
          emailMatch = tail.match(EMAIL_RE);
      
          url = emailMatch[0].slice(1, -1);
          fullUrl = state.md.normalizeLink('mailto:' + url);
          if (!state.md.validateLink(fullUrl)) { return false; }
      
          if (!silent) {
            token         = state.push('link_open', 'a', 1);
            token.attrs   = [ [ 'href', fullUrl ] ];
            token.markup  = 'autolink';
            token.info    = 'auto';
      
            token         = state.push('text', '', 0);
            token.content = state.md.normalizeLinkText(url);
      
            token         = state.push('link_close', 'a', -1);
            token.markup  = 'autolink';
            token.info    = 'auto';
          }
      
          state.pos += emailMatch[0].length;
          return true;
        }
      
        return false;
      };
      
      },{}],38:[function(require,module,exports){
      
      module.exports = function backtick(state, silent) {
        var start, max, marker, matchStart, matchEnd, token,
            pos = state.pos,
            ch = state.src.charCodeAt(pos);
      
        if (ch !== 0x60/* ` */) { return false; }
      
        start = pos;
        pos++;
        max = state.posMax;
      
        while (pos < max && state.src.charCodeAt(pos) === 0x60/* ` */) { pos++; }
      
        marker = state.src.slice(start, pos);
      
        matchStart = matchEnd = pos;
      
        while ((matchStart = state.src.indexOf('`', matchEnd)) !== -1) {
          matchEnd = matchStart + 1;
      
          while (matchEnd < max && state.src.charCodeAt(matchEnd) === 0x60/* ` */) { matchEnd++; }
      
          if (matchEnd - matchStart === marker.length) {
            if (!silent) {
              token         = state.push('code_inline', 'code', 0);
              token.markup  = marker;
              token.content = state.src.slice(pos, matchStart)
                .replace(/\n/g, ' ')
                .replace(/^ (.+) $/, '$1');
            }
            state.pos = matchEnd;
            return true;
          }
        }
      
        if (!silent) { state.pending += marker; }
        state.pos += marker.length;
        return true;
      };
      
      },{}],39:[function(require,module,exports){
      
      
      function processDelimiters(state, delimiters) {
        var closerIdx, openerIdx, closer, opener, minOpenerIdx, newMinOpenerIdx,
            isOddMatch, lastJump,
            openersBottom = {},
            max = delimiters.length;
      
        for (closerIdx = 0; closerIdx < max; closerIdx++) {
          closer = delimiters[closerIdx];
      
          // Length is only used for emphasis-specific "rule of 3",
          // if it's not defined (in strikethrough or 3rd party plugins),
          // we can default it to 0 to disable those checks.
          //
          closer.length = closer.length || 0;
      
          if (!closer.close) continue;
      
          // Previously calculated lower bounds (previous fails)
          // for each marker and each delimiter length modulo 3.
          if (!openersBottom.hasOwnProperty(closer.marker)) {
            openersBottom[closer.marker] = [ -1, -1, -1 ];
          }
      
          minOpenerIdx = openersBottom[closer.marker][closer.length % 3];
          newMinOpenerIdx = -1;
      
          openerIdx = closerIdx - closer.jump - 1;
      
          for (; openerIdx > minOpenerIdx; openerIdx -= opener.jump + 1) {
            opener = delimiters[openerIdx];
      
            if (opener.marker !== closer.marker) continue;
      
            if (newMinOpenerIdx === -1) newMinOpenerIdx = openerIdx;
      
            if (opener.open &&
                opener.end < 0 &&
                opener.level === closer.level) {
      
              isOddMatch = false;
      
              // from spec:
              //
              // If one of the delimiters can both open and close emphasis, then the
              // sum of the lengths of the delimiter runs containing the opening and
              // closing delimiters must not be a multiple of 3 unless both lengths
              // are multiples of 3.
              //
              if (opener.close || closer.open) {
                if ((opener.length + closer.length) % 3 === 0) {
                  if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
                    isOddMatch = true;
                  }
                }
              }
      
              if (!isOddMatch) {
                // If previous delimiter cannot be an opener, we can safely skip
                // the entire sequence in future checks. This is required to make
                // sure algorithm has linear complexity (see *_*_*_*_*_... case).
                //
                lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ?
                  delimiters[openerIdx - 1].jump + 1 :
                  0;
      
                closer.jump  = closerIdx - openerIdx + lastJump;
                closer.open  = false;
                opener.end   = closerIdx;
                opener.jump  = lastJump;
                opener.close = false;
                newMinOpenerIdx = -1;
                break;
              }
            }
          }
      
          if (newMinOpenerIdx !== -1) {
            // If match for this delimiter run failed, we want to set lower bound for
            // future lookups. This is required to make sure algorithm has linear
            // complexity.
            //
            // See details here:
            // https://github.com/commonmark/cmark/issues/178#issuecomment-270417442
            //
            openersBottom[closer.marker][(closer.length || 0) % 3] = newMinOpenerIdx;
          }
        }
      }
      
      
      module.exports = function link_pairs(state) {
        var curr,
            tokens_meta = state.tokens_meta,
            max = state.tokens_meta.length;
      
        processDelimiters(state, state.delimiters);
      
        for (curr = 0; curr < max; curr++) {
          if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
            processDelimiters(state, tokens_meta[curr].delimiters);
          }
        }
      };
      
      },{}],40:[function(require,module,exports){
      
      
      // Insert each marker as a separate text token, and add it to delimiter list
      //
      module.exports.tokenize = function emphasis(state, silent) {
        var i, scanned, token,
            start = state.pos,
            marker = state.src.charCodeAt(start);
      
        if (silent) { return false; }
      
        if (marker !== 0x5F /* _ */ && marker !== 0x2A /* * */) { return false; }
      
        scanned = state.scanDelims(state.pos, marker === 0x2A);
      
        for (i = 0; i < scanned.length; i++) {
          token         = state.push('text', '', 0);
          token.content = String.fromCharCode(marker);
      
          state.delimiters.push({
            // Char code of the starting marker (number).
            //
            marker: marker,
      
            // Total length of these series of delimiters.
            //
            length: scanned.length,
      
            // An amount of characters before this one that's equivalent to
            // current one. In plain English: if this delimiter does not open
            // an emphasis, neither do previous `jump` characters.
            //
            // Used to skip sequences like "*****" in one step, for 1st asterisk
            // value will be 0, for 2nd it's 1 and so on.
            //
            jump:   i,
      
            // A position of the token this delimiter corresponds to.
            //
            token:  state.tokens.length - 1,
      
            // If this delimiter is matched as a valid opener, `end` will be
            // equal to its position, otherwise it's `-1`.
            //
            end:    -1,
      
            // Boolean flags that determine if this delimiter could open or close
            // an emphasis.
            //
            open:   scanned.can_open,
            close:  scanned.can_close
          });
        }
      
        state.pos += scanned.length;
      
        return true;
      };
      
      
      function postProcess(state, delimiters) {
        var i,
            startDelim,
            endDelim,
            token,
            ch,
            isStrong,
            max = delimiters.length;
      
        for (i = max - 1; i >= 0; i--) {
          startDelim = delimiters[i];
      
          if (startDelim.marker !== 0x5F/* _ */ && startDelim.marker !== 0x2A/* * */) {
            continue;
          }
      
          // Process only opening markers
          if (startDelim.end === -1) {
            continue;
          }
      
          endDelim = delimiters[startDelim.end];
      
          // If the previous delimiter has the same marker and is adjacent to this one,
          // merge those into one strong delimiter.
          //
          // `<em><em>whatever</em></em>` -> `<strong>whatever</strong>`
          //
          isStrong = i > 0 &&
                     delimiters[i - 1].end === startDelim.end + 1 &&
                     delimiters[i - 1].token === startDelim.token - 1 &&
                     delimiters[startDelim.end + 1].token === endDelim.token + 1 &&
                     delimiters[i - 1].marker === startDelim.marker;
      
          ch = String.fromCharCode(startDelim.marker);
      
          token         = state.tokens[startDelim.token];
          token.type    = isStrong ? 'strong_open' : 'em_open';
          token.tag     = isStrong ? 'strong' : 'em';
          token.nesting = 1;
          token.markup  = isStrong ? ch + ch : ch;
          token.content = '';
      
          token         = state.tokens[endDelim.token];
          token.type    = isStrong ? 'strong_close' : 'em_close';
          token.tag     = isStrong ? 'strong' : 'em';
          token.nesting = -1;
          token.markup  = isStrong ? ch + ch : ch;
          token.content = '';
      
          if (isStrong) {
            state.tokens[delimiters[i - 1].token].content = '';
            state.tokens[delimiters[startDelim.end + 1].token].content = '';
            i--;
          }
        }
      }
      
      
      // Walk through delimiter list and replace text tokens with tags
      //
      module.exports.postProcess = function emphasis(state) {
        var curr,
            tokens_meta = state.tokens_meta,
            max = state.tokens_meta.length;
      
        postProcess(state, state.delimiters);
      
        for (curr = 0; curr < max; curr++) {
          if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
            postProcess(state, tokens_meta[curr].delimiters);
          }
        }
      };
      
      },{}],41:[function(require,module,exports){
      
      var entities          = require('../common/entities');
      var has               = require('../common/utils').has;
      var isValidEntityCode = require('../common/utils').isValidEntityCode;
      var fromCodePoint     = require('../common/utils').fromCodePoint;
      
      
      var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
      var NAMED_RE   = /^&([a-z][a-z0-9]{1,31});/i;
      
      
      module.exports = function entity(state, silent) {
        var ch, code, match, pos = state.pos, max = state.posMax;
      
        if (state.src.charCodeAt(pos) !== 0x26/* & */) { return false; }
      
        if (pos + 1 < max) {
          ch = state.src.charCodeAt(pos + 1);
      
          if (ch === 0x23 /* # */) {
            match = state.src.slice(pos).match(DIGITAL_RE);
            if (match) {
              if (!silent) {
                code = match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
                state.pending += isValidEntityCode(code) ? fromCodePoint(code) : fromCodePoint(0xFFFD);
              }
              state.pos += match[0].length;
              return true;
            }
          } else {
            match = state.src.slice(pos).match(NAMED_RE);
            if (match) {
              if (has(entities, match[1])) {
                if (!silent) { state.pending += entities[match[1]]; }
                state.pos += match[0].length;
                return true;
              }
            }
          }
        }
      
        if (!silent) { state.pending += '&'; }
        state.pos++;
        return true;
      };
      
      },{"../common/entities":1,"../common/utils":4}],42:[function(require,module,exports){
      
      var isSpace = require('../common/utils').isSpace;
      
      var ESCAPED = [];
      
      for (var i = 0; i < 256; i++) { ESCAPED.push(0); }
      
      '\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'
        .split('').forEach(function (ch) { ESCAPED[ch.charCodeAt(0)] = 1; });
      
      
      module.exports = function escape(state, silent) {
        var ch, pos = state.pos, max = state.posMax;
      
        if (state.src.charCodeAt(pos) !== 0x5C/* \ */) { return false; }
      
        pos++;
      
        if (pos < max) {
          ch = state.src.charCodeAt(pos);
      
          if (ch < 256 && ESCAPED[ch] !== 0) {
            if (!silent) { state.pending += state.src[pos]; }
            state.pos += 2;
            return true;
          }
      
          if (ch === 0x0A) {
            if (!silent) {
              state.push('hardbreak', 'br', 0);
            }
      
            pos++;
            // skip leading whitespaces from next line
            while (pos < max) {
              ch = state.src.charCodeAt(pos);
              if (!isSpace(ch)) { break; }
              pos++;
            }
      
            state.pos = pos;
            return true;
          }
        }
      
        if (!silent) { state.pending += '\\'; }
        state.pos++;
        return true;
      };
      
      },{"../common/utils":4}],43:[function(require,module,exports){
      
      
      var HTML_TAG_RE = require('../common/html_re').HTML_TAG_RE;
      
      
      function isLetter(ch) {
        /*eslint no-bitwise:0*/
        var lc = ch | 0x20; // to lower case
        return (lc >= 0x61/* a */) && (lc <= 0x7a/* z */);
      }
      
      
      module.exports = function html_inline(state, silent) {
        var ch, match, max, token,
            pos = state.pos;
      
        if (!state.md.options.html) { return false; }
      
        // Check start
        max = state.posMax;
        if (state.src.charCodeAt(pos) !== 0x3C/* < */ ||
            pos + 2 >= max) {
          return false;
        }
      
        // Quick fail on second char
        ch = state.src.charCodeAt(pos + 1);
        if (ch !== 0x21/* ! */ &&
            ch !== 0x3F/* ? */ &&
            ch !== 0x2F/* / */ &&
            !isLetter(ch)) {
          return false;
        }
      
        match = state.src.slice(pos).match(HTML_TAG_RE);
        if (!match) { return false; }
      
        if (!silent) {
          token         = state.push('html_inline', '', 0);
          token.content = state.src.slice(pos, pos + match[0].length);
        }
        state.pos += match[0].length;
        return true;
      };
      
      },{"../common/html_re":3}],44:[function(require,module,exports){
      
      var normalizeReference   = require('../common/utils').normalizeReference;
      var isSpace              = require('../common/utils').isSpace;
      
      
      module.exports = function image(state, silent) {
        var attrs,
            code,
            content,
            label,
            labelEnd,
            labelStart,
            pos,
            ref,
            res,
            title,
            token,
            tokens,
            start,
            href = '',
            oldPos = state.pos,
            max = state.posMax;
      
        if (state.src.charCodeAt(state.pos) !== 0x21/* ! */) { return false; }
        if (state.src.charCodeAt(state.pos + 1) !== 0x5B/* [ */) { return false; }
      
        labelStart = state.pos + 2;
        labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
      
        // parser failed to find ']', so it's not a valid link
        if (labelEnd < 0) { return false; }
      
        pos = labelEnd + 1;
        if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
          //
          // Inline link
          //
      
          // [link](  <href>  "title"  )
          //        ^^ skipping these spaces
          pos++;
          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);
            if (!isSpace(code) && code !== 0x0A) { break; }
          }
          if (pos >= max) { return false; }
      
          // [link](  <href>  "title"  )
          //          ^^^^^^ parsing link destination
          start = pos;
          res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
          if (res.ok) {
            href = state.md.normalizeLink(res.str);
            if (state.md.validateLink(href)) {
              pos = res.pos;
            } else {
              href = '';
            }
          }
      
          // [link](  <href>  "title"  )
          //                ^^ skipping these spaces
          start = pos;
          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);
            if (!isSpace(code) && code !== 0x0A) { break; }
          }
      
          // [link](  <href>  "title"  )
          //                  ^^^^^^^ parsing link title
          res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
          if (pos < max && start !== pos && res.ok) {
            title = res.str;
            pos = res.pos;
      
            // [link](  <href>  "title"  )
            //                         ^^ skipping these spaces
            for (; pos < max; pos++) {
              code = state.src.charCodeAt(pos);
              if (!isSpace(code) && code !== 0x0A) { break; }
            }
          } else {
            title = '';
          }
      
          if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
            state.pos = oldPos;
            return false;
          }
          pos++;
        } else {
          //
          // Link reference
          //
          if (typeof state.env.references === 'undefined') { return false; }
      
          if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
            start = pos + 1;
            pos = state.md.helpers.parseLinkLabel(state, pos);
            if (pos >= 0) {
              label = state.src.slice(start, pos++);
            } else {
              pos = labelEnd + 1;
            }
          } else {
            pos = labelEnd + 1;
          }
      
          // covers label === '' and label === undefined
          // (collapsed reference link and shortcut reference link respectively)
          if (!label) { label = state.src.slice(labelStart, labelEnd); }
      
          ref = state.env.references[normalizeReference(label)];
          if (!ref) {
            state.pos = oldPos;
            return false;
          }
          href = ref.href;
          title = ref.title;
        }
      
        //
        // We found the end of the link, and know for a fact it's a valid link;
        // so all that's left to do is to call tokenizer.
        //
        if (!silent) {
          content = state.src.slice(labelStart, labelEnd);
      
          state.md.inline.parse(
            content,
            state.md,
            state.env,
            tokens = []
          );
      
          token          = state.push('image', 'img', 0);
          token.attrs    = attrs = [ [ 'src', href ], [ 'alt', '' ] ];
          token.children = tokens;
          token.content  = content;
      
          if (title) {
            attrs.push([ 'title', title ]);
          }
        }
      
        state.pos = pos;
        state.posMax = max;
        return true;
      };
      
      },{"../common/utils":4}],45:[function(require,module,exports){
      
      var normalizeReference   = require('../common/utils').normalizeReference;
      var isSpace              = require('../common/utils').isSpace;
      
      
      module.exports = function link(state, silent) {
        var attrs,
            code,
            label,
            labelEnd,
            labelStart,
            pos,
            res,
            ref,
            title,
            token,
            href = '',
            oldPos = state.pos,
            max = state.posMax,
            start = state.pos,
            parseReference = true;
      
        if (state.src.charCodeAt(state.pos) !== 0x5B/* [ */) { return false; }
      
        labelStart = state.pos + 1;
        labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
      
        // parser failed to find ']', so it's not a valid link
        if (labelEnd < 0) { return false; }
      
        pos = labelEnd + 1;
        if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
          //
          // Inline link
          //
      
          // might have found a valid shortcut link, disable reference parsing
          parseReference = false;
      
          // [link](  <href>  "title"  )
          //        ^^ skipping these spaces
          pos++;
          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);
            if (!isSpace(code) && code !== 0x0A) { break; }
          }
          if (pos >= max) { return false; }
      
          // [link](  <href>  "title"  )
          //          ^^^^^^ parsing link destination
          start = pos;
          res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
          if (res.ok) {
            href = state.md.normalizeLink(res.str);
            if (state.md.validateLink(href)) {
              pos = res.pos;
            } else {
              href = '';
            }
          }
      
          // [link](  <href>  "title"  )
          //                ^^ skipping these spaces
          start = pos;
          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);
            if (!isSpace(code) && code !== 0x0A) { break; }
          }
      
          // [link](  <href>  "title"  )
          //                  ^^^^^^^ parsing link title
          res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
          if (pos < max && start !== pos && res.ok) {
            title = res.str;
            pos = res.pos;
      
            // [link](  <href>  "title"  )
            //                         ^^ skipping these spaces
            for (; pos < max; pos++) {
              code = state.src.charCodeAt(pos);
              if (!isSpace(code) && code !== 0x0A) { break; }
            }
          } else {
            title = '';
          }
      
          if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
            // parsing a valid shortcut link failed, fallback to reference
            parseReference = true;
          }
          pos++;
        }
      
        if (parseReference) {
          //
          // Link reference
          //
          if (typeof state.env.references === 'undefined') { return false; }
      
          if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
            start = pos + 1;
            pos = state.md.helpers.parseLinkLabel(state, pos);
            if (pos >= 0) {
              label = state.src.slice(start, pos++);
            } else {
              pos = labelEnd + 1;
            }
          } else {
            pos = labelEnd + 1;
          }
      
          // covers label === '' and label === undefined
          // (collapsed reference link and shortcut reference link respectively)
          if (!label) { label = state.src.slice(labelStart, labelEnd); }
      
          ref = state.env.references[normalizeReference(label)];
          if (!ref) {
            state.pos = oldPos;
            return false;
          }
          href = ref.href;
          title = ref.title;
        }
      
        //
        // We found the end of the link, and know for a fact it's a valid link;
        // so all that's left to do is to call tokenizer.
        //
        if (!silent) {
          state.pos = labelStart;
          state.posMax = labelEnd;
      
          token        = state.push('link_open', 'a', 1);
          token.attrs  = attrs = [ [ 'href', href ] ];
          if (title) {
            attrs.push([ 'title', title ]);
          }
      
          state.md.inline.tokenize(state);
      
          token        = state.push('link_close', 'a', -1);
        }
      
        state.pos = pos;
        state.posMax = max;
        return true;
      };
      
      },{"../common/utils":4}],46:[function(require,module,exports){
      
      var isSpace = require('../common/utils').isSpace;
      
      
      module.exports = function newline(state, silent) {
        var pmax, max, pos = state.pos;
      
        if (state.src.charCodeAt(pos) !== 0x0A/* \n */) { return false; }
      
        pmax = state.pending.length - 1;
        max = state.posMax;
      
        // '  \n' -> hardbreak
        // Lookup in pending chars is bad practice! Don't copy to other rules!
        // Pending string is stored in concat mode, indexed lookups will cause
        // convertion to flat mode.
        if (!silent) {
          if (pmax >= 0 && state.pending.charCodeAt(pmax) === 0x20) {
            if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 0x20) {
              state.pending = state.pending.replace(/ +$/, '');
              state.push('hardbreak', 'br', 0);
            } else {
              state.pending = state.pending.slice(0, -1);
              state.push('softbreak', 'br', 0);
            }
      
          } else {
            state.push('softbreak', 'br', 0);
          }
        }
      
        pos++;
      
        // skip heading spaces for next line
        while (pos < max && isSpace(state.src.charCodeAt(pos))) { pos++; }
      
        state.pos = pos;
        return true;
      };
      
      },{"../common/utils":4}],47:[function(require,module,exports){
      
      
      var Token          = require('../token');
      var isWhiteSpace   = require('../common/utils').isWhiteSpace;
      var isPunctChar    = require('../common/utils').isPunctChar;
      var isMdAsciiPunct = require('../common/utils').isMdAsciiPunct;
      
      
      function StateInline(src, md, env, outTokens) {
        this.src = src;
        this.env = env;
        this.md = md;
        this.tokens = outTokens;
        this.tokens_meta = Array(outTokens.length);
      
        this.pos = 0;
        this.posMax = this.src.length;
        this.level = 0;
        this.pending = '';
        this.pendingLevel = 0;
      
        // Stores { start: end } pairs. Useful for backtrack
        // optimization of pairs parse (emphasis, strikes).
        this.cache = {};
      
        // List of emphasis-like delimiters for current tag
        this.delimiters = [];
      
        // Stack of delimiter lists for upper level tags
        this._prev_delimiters = [];
      }
      
      
      // Flush pending text
      //
      StateInline.prototype.pushPending = function () {
        var token = new Token('text', '', 0);
        token.content = this.pending;
        token.level = this.pendingLevel;
        this.tokens.push(token);
        this.pending = '';
        return token;
      };
      
      
      // Push new token to "stream".
      // If pending text exists - flush it as text token
      //
      StateInline.prototype.push = function (type, tag, nesting) {
        if (this.pending) {
          this.pushPending();
        }
      
        var token = new Token(type, tag, nesting);
        var token_meta = null;
      
        if (nesting < 0) {
          // closing tag
          this.level--;
          this.delimiters = this._prev_delimiters.pop();
        }
      
        token.level = this.level;
      
        if (nesting > 0) {
          // opening tag
          this.level++;
          this._prev_delimiters.push(this.delimiters);
          this.delimiters = [];
          token_meta = { delimiters: this.delimiters };
        }
      
        this.pendingLevel = this.level;
        this.tokens.push(token);
        this.tokens_meta.push(token_meta);
        return token;
      };
      
      
      // Scan a sequence of emphasis-like markers, and determine whether
      // it can start an emphasis sequence or end an emphasis sequence.
      //
      //  - start - position to scan from (it should point at a valid marker);
      //  - canSplitWord - determine if these markers can be found inside a word
      //
      StateInline.prototype.scanDelims = function (start, canSplitWord) {
        var pos = start, lastChar, nextChar, count, can_open, can_close,
            isLastWhiteSpace, isLastPunctChar,
            isNextWhiteSpace, isNextPunctChar,
            left_flanking = true,
            right_flanking = true,
            max = this.posMax,
            marker = this.src.charCodeAt(start);
      
        // treat beginning of the line as a whitespace
        lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20;
      
        while (pos < max && this.src.charCodeAt(pos) === marker) { pos++; }
      
        count = pos - start;
      
        // treat end of the line as a whitespace
        nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20;
      
        isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
        isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
      
        isLastWhiteSpace = isWhiteSpace(lastChar);
        isNextWhiteSpace = isWhiteSpace(nextChar);
      
        if (isNextWhiteSpace) {
          left_flanking = false;
        } else if (isNextPunctChar) {
          if (!(isLastWhiteSpace || isLastPunctChar)) {
            left_flanking = false;
          }
        }
      
        if (isLastWhiteSpace) {
          right_flanking = false;
        } else if (isLastPunctChar) {
          if (!(isNextWhiteSpace || isNextPunctChar)) {
            right_flanking = false;
          }
        }
      
        if (!canSplitWord) {
          can_open  = left_flanking  && (!right_flanking || isLastPunctChar);
          can_close = right_flanking && (!left_flanking  || isNextPunctChar);
        } else {
          can_open  = left_flanking;
          can_close = right_flanking;
        }
      
        return {
          can_open:  can_open,
          can_close: can_close,
          length:    count
        };
      };
      
      
      // re-export Token class to use in block rules
      StateInline.prototype.Token = Token;
      
      
      module.exports = StateInline;
      
      },{"../common/utils":4,"../token":51}],48:[function(require,module,exports){
      
      
      // Insert each marker as a separate text token, and add it to delimiter list
      //
      module.exports.tokenize = function strikethrough(state, silent) {
        var i, scanned, token, len, ch,
            start = state.pos,
            marker = state.src.charCodeAt(start);
      
        if (silent) { return false; }
      
        if (marker !== 0x7E/* ~ */) { return false; }
      
        scanned = state.scanDelims(state.pos, true);
        len = scanned.length;
        ch = String.fromCharCode(marker);
      
        if (len < 2) { return false; }
      
        if (len % 2) {
          token         = state.push('text', '', 0);
          token.content = ch;
          len--;
        }
      
        for (i = 0; i < len; i += 2) {
          token         = state.push('text', '', 0);
          token.content = ch + ch;
      
          state.delimiters.push({
            marker: marker,
            length: 0, // disable "rule of 3" length checks meant for emphasis
            jump:   i,
            token:  state.tokens.length - 1,
            end:    -1,
            open:   scanned.can_open,
            close:  scanned.can_close
          });
        }
      
        state.pos += scanned.length;
      
        return true;
      };
      
      
      function postProcess(state, delimiters) {
        var i, j,
            startDelim,
            endDelim,
            token,
            loneMarkers = [],
            max = delimiters.length;
      
        for (i = 0; i < max; i++) {
          startDelim = delimiters[i];
      
          if (startDelim.marker !== 0x7E/* ~ */) {
            continue;
          }
      
          if (startDelim.end === -1) {
            continue;
          }
      
          endDelim = delimiters[startDelim.end];
      
          token         = state.tokens[startDelim.token];
          token.type    = 's_open';
          token.tag     = 's';
          token.nesting = 1;
          token.markup  = '~~';
          token.content = '';
      
          token         = state.tokens[endDelim.token];
          token.type    = 's_close';
          token.tag     = 's';
          token.nesting = -1;
          token.markup  = '~~';
          token.content = '';
      
          if (state.tokens[endDelim.token - 1].type === 'text' &&
              state.tokens[endDelim.token - 1].content === '~') {
      
            loneMarkers.push(endDelim.token - 1);
          }
        }
      
        // If a marker sequence has an odd number of characters, it's splitted
        // like this: `~~~~~` -> `~` + `~~` + `~~`, leaving one marker at the
        // start of the sequence.
        //
        // So, we have to move all those markers after subsequent s_close tags.
        //
        while (loneMarkers.length) {
          i = loneMarkers.pop();
          j = i + 1;
      
          while (j < state.tokens.length && state.tokens[j].type === 's_close') {
            j++;
          }
      
          j--;
      
          if (i !== j) {
            token = state.tokens[j];
            state.tokens[j] = state.tokens[i];
            state.tokens[i] = token;
          }
        }
      }
      
      
      // Walk through delimiter list and replace text tokens with tags
      //
      module.exports.postProcess = function strikethrough(state) {
        var curr,
            tokens_meta = state.tokens_meta,
            max = state.tokens_meta.length;
      
        postProcess(state, state.delimiters);
      
        for (curr = 0; curr < max; curr++) {
          if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
            postProcess(state, tokens_meta[curr].delimiters);
          }
        }
      };
      
      },{}],49:[function(require,module,exports){
      
      
      // Rule to skip pure text
      // '{}$%@~+=:' reserved for extentions
      
      // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
      
      // !!!! Don't confuse with "Markdown ASCII Punctuation" chars
      // http://spec.commonmark.org/0.15/#ascii-punctuation-character
      function isTerminatorChar(ch) {
        switch (ch) {
          case 0x0A/* \n */:
          case 0x21/* ! */:
          case 0x23/* # */:
          case 0x24/* $ */:
          case 0x25/* % */:
          case 0x26/* & */:
          case 0x2A/* * */:
          case 0x2B/* + */:
          case 0x2D/* - */:
          case 0x3A/* : */:
          case 0x3C/* < */:
          case 0x3D/* = */:
          case 0x3E/* > */:
          case 0x40/* @ */:
          case 0x5B/* [ */:
          case 0x5C/* \ */:
          case 0x5D/* ] */:
          case 0x5E/* ^ */:
          case 0x5F/* _ */:
          case 0x60/* ` */:
          case 0x7B/* { */:
          case 0x7D/* } */:
          case 0x7E/* ~ */:
            return true;
          default:
            return false;
        }
      }
      
      module.exports = function text(state, silent) {
        var pos = state.pos;
      
        while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
          pos++;
        }
      
        if (pos === state.pos) { return false; }
      
        if (!silent) { state.pending += state.src.slice(state.pos, pos); }
      
        state.pos = pos;
      
        return true;
      };
      
      // Alternative implementation, for memory.
      //
      // It costs 10% of performance, but allows extend terminators list, if place it
      // to `ParcerInline` property. Probably, will switch to it sometime, such
      // flexibility required.
      
      /*
      var TERMINATOR_RE = /[\n!#$%&*+\-:<=>@[\\\]^_`{}~]/;
      
      module.exports = function text(state, silent) {
        var pos = state.pos,
            idx = state.src.slice(pos).search(TERMINATOR_RE);
      
        // first char is terminator -> empty text
        if (idx === 0) { return false; }
      
        // no terminator -> text till end of string
        if (idx < 0) {
          if (!silent) { state.pending += state.src.slice(pos); }
          state.pos = state.src.length;
          return true;
        }
      
        if (!silent) { state.pending += state.src.slice(pos, pos + idx); }
      
        state.pos += idx;
      
        return true;
      };*/
      
      },{}],50:[function(require,module,exports){
      
      
      module.exports = function text_collapse(state) {
        var curr, last,
            level = 0,
            tokens = state.tokens,
            max = state.tokens.length;
      
        for (curr = last = 0; curr < max; curr++) {
          // re-calculate levels after emphasis/strikethrough turns some text nodes
          // into opening/closing tags
          if (tokens[curr].nesting < 0) level--; // closing tag
          tokens[curr].level = level;
          if (tokens[curr].nesting > 0) level++; // opening tag
      
          if (tokens[curr].type === 'text' &&
              curr + 1 < max &&
              tokens[curr + 1].type === 'text') {
      
            // collapse two adjacent text nodes
            tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
          } else {
            if (curr !== last) { tokens[last] = tokens[curr]; }
      
            last++;
          }
        }
      
        if (curr !== last) {
          tokens.length = last;
        }
      };
      
      },{}],51:[function(require,module,exports){
      
      
      /**
       * class Token
       **/
      
      /**
       * new Token(type, tag, nesting)
       *
       * Create new token and fill passed properties.
       **/
      function Token(type, tag, nesting) {
        /**
         * Token#type -> String
         *
         * Type of the token (string, e.g. "paragraph_open")
         **/
        this.type     = type;
      
        /**
         * Token#tag -> String
         *
         * html tag name, e.g. "p"
         **/
        this.tag      = tag;
      
        /**
         * Token#attrs -> Array
         *
         * Html attributes. Format: `[ [ name1, value1 ], [ name2, value2 ] ]`
         **/
        this.attrs    = null;
      
        /**
         * Token#map -> Array
         *
         * Source map info. Format: `[ line_begin, line_end ]`
         **/
        this.map      = null;
      
        /**
         * Token#nesting -> Number
         *
         * Level change (number in {-1, 0, 1} set), where:
         *
         * -  `1` means the tag is opening
         * -  `0` means the tag is self-closing
         * - `-1` means the tag is closing
         **/
        this.nesting  = nesting;
      
        /**
         * Token#level -> Number
         *
         * nesting level, the same as `state.level`
         **/
        this.level    = 0;
      
        /**
         * Token#children -> Array
         *
         * An array of child nodes (inline and img tokens)
         **/
        this.children = null;
      
        /**
         * Token#content -> String
         *
         * In a case of self-closing tag (code, html, fence, etc.),
         * it has contents of this tag.
         **/
        this.content  = '';
      
        /**
         * Token#markup -> String
         *
         * '*' or '_' for emphasis, fence string for fence, etc.
         **/
        this.markup   = '';
      
        /**
         * Token#info -> String
         *
         * fence infostring
         **/
        this.info     = '';
      
        /**
         * Token#meta -> Object
         *
         * A place for plugins to store an arbitrary data
         **/
        this.meta     = null;
      
        /**
         * Token#block -> Boolean
         *
         * True for block-level tokens, false for inline tokens.
         * Used in renderer to calculate line breaks
         **/
        this.block    = false;
      
        /**
         * Token#hidden -> Boolean
         *
         * If it's true, ignore this element when rendering. Used for tight lists
         * to hide paragraphs.
         **/
        this.hidden   = false;
      }
      
      
      /**
       * Token.attrIndex(name) -> Number
       *
       * Search attribute index by name.
       **/
      Token.prototype.attrIndex = function attrIndex(name) {
        var attrs, i, len;
      
        if (!this.attrs) { return -1; }
      
        attrs = this.attrs;
      
        for (i = 0, len = attrs.length; i < len; i++) {
          if (attrs[i][0] === name) { return i; }
        }
        return -1;
      };
      
      
      /**
       * Token.attrPush(attrData)
       *
       * Add `[ name, value ]` attribute to list. Init attrs if necessary
       **/
      Token.prototype.attrPush = function attrPush(attrData) {
        if (this.attrs) {
          this.attrs.push(attrData);
        } else {
          this.attrs = [ attrData ];
        }
      };
      
      
      /**
       * Token.attrSet(name, value)
       *
       * Set `name` attribute to `value`. Override old value if exists.
       **/
      Token.prototype.attrSet = function attrSet(name, value) {
        var idx = this.attrIndex(name),
            attrData = [ name, value ];
      
        if (idx < 0) {
          this.attrPush(attrData);
        } else {
          this.attrs[idx] = attrData;
        }
      };
      
      
      /**
       * Token.attrGet(name)
       *
       * Get the value of attribute `name`, or null if it does not exist.
       **/
      Token.prototype.attrGet = function attrGet(name) {
        var idx = this.attrIndex(name), value = null;
        if (idx >= 0) {
          value = this.attrs[idx][1];
        }
        return value;
      };
      
      
      /**
       * Token.attrJoin(name, value)
       *
       * Join value to existing attribute via space. Or create new attribute if not
       * exists. Useful to operate with token classes.
       **/
      Token.prototype.attrJoin = function attrJoin(name, value) {
        var idx = this.attrIndex(name);
      
        if (idx < 0) {
          this.attrPush([ name, value ]);
        } else {
          this.attrs[idx][1] = this.attrs[idx][1] + ' ' + value;
        }
      };
      
      
      module.exports = Token;
      
      },{}],52:[function(require,module,exports){
      module.exports={ "Aacute": "\u00C1", "aacute": "\u00E1", "Abreve": "\u0102", "abreve": "\u0103", "ac": "\u223E", "acd": "\u223F", "acE": "\u223E\u0333", "Acirc": "\u00C2", "acirc": "\u00E2", "acute": "\u00B4", "Acy": "\u0410", "acy": "\u0430", "AElig": "\u00C6", "aelig": "\u00E6", "af": "\u2061", "Afr": "\uD835\uDD04", "afr": "\uD835\uDD1E", "Agrave": "\u00C0", "agrave": "\u00E0", "alefsym": "\u2135", "aleph": "\u2135", "Alpha": "\u0391", "alpha": "\u03B1", "Amacr": "\u0100", "amacr": "\u0101", "amalg": "\u2A3F", "amp": "&", "AMP": "&", "andand": "\u2A55", "And": "\u2A53", "and": "\u2227", "andd": "\u2A5C", "andslope": "\u2A58", "andv": "\u2A5A", "ang": "\u2220", "ange": "\u29A4", "angle": "\u2220", "angmsdaa": "\u29A8", "angmsdab": "\u29A9", "angmsdac": "\u29AA", "angmsdad": "\u29AB", "angmsdae": "\u29AC", "angmsdaf": "\u29AD", "angmsdag": "\u29AE", "angmsdah": "\u29AF", "angmsd": "\u2221", "angrt": "\u221F", "angrtvb": "\u22BE", "angrtvbd": "\u299D", "angsph": "\u2222", "angst": "\u00C5", "angzarr": "\u237C", "Aogon": "\u0104", "aogon": "\u0105", "Aopf": "\uD835\uDD38", "aopf": "\uD835\uDD52", "apacir": "\u2A6F", "ap": "\u2248", "apE": "\u2A70", "ape": "\u224A", "apid": "\u224B", "apos": "'", "ApplyFunction": "\u2061", "approx": "\u2248", "approxeq": "\u224A", "Aring": "\u00C5", "aring": "\u00E5", "Ascr": "\uD835\uDC9C", "ascr": "\uD835\uDCB6", "Assign": "\u2254", "ast": "*", "asymp": "\u2248", "asympeq": "\u224D", "Atilde": "\u00C3", "atilde": "\u00E3", "Auml": "\u00C4", "auml": "\u00E4", "awconint": "\u2233", "awint": "\u2A11", "backcong": "\u224C", "backepsilon": "\u03F6", "backprime": "\u2035", "backsim": "\u223D", "backsimeq": "\u22CD", "Backslash": "\u2216", "Barv": "\u2AE7", "barvee": "\u22BD", "barwed": "\u2305", "Barwed": "\u2306", "barwedge": "\u2305", "bbrk": "\u23B5", "bbrktbrk": "\u23B6", "bcong": "\u224C", "Bcy": "\u0411", "bcy": "\u0431", "bdquo": "\u201E", "becaus": "\u2235", "because": "\u2235", "Because": "\u2235", "bemptyv": "\u29B0", "bepsi": "\u03F6", "bernou": "\u212C", "Bernoullis": "\u212C", "Beta": "\u0392", "beta": "\u03B2", "beth": "\u2136", "between": "\u226C", "Bfr": "\uD835\uDD05", "bfr": "\uD835\uDD1F", "bigcap": "\u22C2", "bigcirc": "\u25EF", "bigcup": "\u22C3", "bigodot": "\u2A00", "bigoplus": "\u2A01", "bigotimes": "\u2A02", "bigsqcup": "\u2A06", "bigstar": "\u2605", "bigtriangledown": "\u25BD", "bigtriangleup": "\u25B3", "biguplus": "\u2A04", "bigvee": "\u22C1", "bigwedge": "\u22C0", "bkarow": "\u290D", "blacklozenge": "\u29EB", "blacksquare": "\u25AA", "blacktriangle": "\u25B4", "blacktriangledown": "\u25BE", "blacktriangleleft": "\u25C2", "blacktriangleright": "\u25B8", "blank": "\u2423", "blk12": "\u2592", "blk14": "\u2591", "blk34": "\u2593", "block": "\u2588", "bne": "=\u20E5", "bnequiv": "\u2261\u20E5", "bNot": "\u2AED", "bnot": "\u2310", "Bopf": "\uD835\uDD39", "bopf": "\uD835\uDD53", "bot": "\u22A5", "bottom": "\u22A5", "bowtie": "\u22C8", "boxbox": "\u29C9", "boxdl": "\u2510", "boxdL": "\u2555", "boxDl": "\u2556", "boxDL": "\u2557", "boxdr": "\u250C", "boxdR": "\u2552", "boxDr": "\u2553", "boxDR": "\u2554", "boxh": "\u2500", "boxH": "\u2550", "boxhd": "\u252C", "boxHd": "\u2564", "boxhD": "\u2565", "boxHD": "\u2566", "boxhu": "\u2534", "boxHu": "\u2567", "boxhU": "\u2568", "boxHU": "\u2569", "boxminus": "\u229F", "boxplus": "\u229E", "boxtimes": "\u22A0", "boxul": "\u2518", "boxuL": "\u255B", "boxUl": "\u255C", "boxUL": "\u255D", "boxur": "\u2514", "boxuR": "\u2558", "boxUr": "\u2559", "boxUR": "\u255A", "boxv": "\u2502", "boxV": "\u2551", "boxvh": "\u253C", "boxvH": "\u256A", "boxVh": "\u256B", "boxVH": "\u256C", "boxvl": "\u2524", "boxvL": "\u2561", "boxVl": "\u2562", "boxVL": "\u2563", "boxvr": "\u251C", "boxvR": "\u255E", "boxVr": "\u255F", "boxVR": "\u2560", "bprime": "\u2035", "breve": "\u02D8", "Breve": "\u02D8", "brvbar": "\u00A6", "bscr": "\uD835\uDCB7", "Bscr": "\u212C", "bsemi": "\u204F", "bsim": "\u223D", "bsime": "\u22CD", "bsolb": "\u29C5", "bsol": "\\", "bsolhsub": "\u27C8", "bull": "\u2022", "bullet": "\u2022", "bump": "\u224E", "bumpE": "\u2AAE", "bumpe": "\u224F", "Bumpeq": "\u224E", "bumpeq": "\u224F", "Cacute": "\u0106", "cacute": "\u0107", "capand": "\u2A44", "capbrcup": "\u2A49", "capcap": "\u2A4B", "cap": "\u2229", "Cap": "\u22D2", "capcup": "\u2A47", "capdot": "\u2A40", "CapitalDifferentialD": "\u2145", "caps": "\u2229\uFE00", "caret": "\u2041", "caron": "\u02C7", "Cayleys": "\u212D", "ccaps": "\u2A4D", "Ccaron": "\u010C", "ccaron": "\u010D", "Ccedil": "\u00C7", "ccedil": "\u00E7", "Ccirc": "\u0108", "ccirc": "\u0109", "Cconint": "\u2230", "ccups": "\u2A4C", "ccupssm": "\u2A50", "Cdot": "\u010A", "cdot": "\u010B", "cedil": "\u00B8", "Cedilla": "\u00B8", "cemptyv": "\u29B2", "cent": "\u00A2", "centerdot": "\u00B7", "CenterDot": "\u00B7", "cfr": "\uD835\uDD20", "Cfr": "\u212D", "CHcy": "\u0427", "chcy": "\u0447", "check": "\u2713", "checkmark": "\u2713", "Chi": "\u03A7", "chi": "\u03C7", "circ": "\u02C6", "circeq": "\u2257", "circlearrowleft": "\u21BA", "circlearrowright": "\u21BB", "circledast": "\u229B", "circledcirc": "\u229A", "circleddash": "\u229D", "CircleDot": "\u2299", "circledR": "\u00AE", "circledS": "\u24C8", "CircleMinus": "\u2296", "CirclePlus": "\u2295", "CircleTimes": "\u2297", "cir": "\u25CB", "cirE": "\u29C3", "cire": "\u2257", "cirfnint": "\u2A10", "cirmid": "\u2AEF", "cirscir": "\u29C2", "ClockwiseContourIntegral": "\u2232", "CloseCurlyDoubleQuote": "\u201D", "CloseCurlyQuote": "\u2019", "clubs": "\u2663", "clubsuit": "\u2663", "colon": ":", "Colon": "\u2237", "Colone": "\u2A74", "colone": "\u2254", "coloneq": "\u2254", "comma": ",", "commat": "@", "comp": "\u2201", "compfn": "\u2218", "complement": "\u2201", "complexes": "\u2102", "cong": "\u2245", "congdot": "\u2A6D", "Congruent": "\u2261", "conint": "\u222E", "Conint": "\u222F", "ContourIntegral": "\u222E", "copf": "\uD835\uDD54", "Copf": "\u2102", "coprod": "\u2210", "Coproduct": "\u2210", "copy": "\u00A9", "COPY": "\u00A9", "copysr": "\u2117", "CounterClockwiseContourIntegral": "\u2233", "crarr": "\u21B5", "cross": "\u2717", "Cross": "\u2A2F", "Cscr": "\uD835\uDC9E", "cscr": "\uD835\uDCB8", "csub": "\u2ACF", "csube": "\u2AD1", "csup": "\u2AD0", "csupe": "\u2AD2", "ctdot": "\u22EF", "cudarrl": "\u2938", "cudarrr": "\u2935", "cuepr": "\u22DE", "cuesc": "\u22DF", "cularr": "\u21B6", "cularrp": "\u293D", "cupbrcap": "\u2A48", "cupcap": "\u2A46", "CupCap": "\u224D", "cup": "\u222A", "Cup": "\u22D3", "cupcup": "\u2A4A", "cupdot": "\u228D", "cupor": "\u2A45", "cups": "\u222A\uFE00", "curarr": "\u21B7", "curarrm": "\u293C", "curlyeqprec": "\u22DE", "curlyeqsucc": "\u22DF", "curlyvee": "\u22CE", "curlywedge": "\u22CF", "curren": "\u00A4", "curvearrowleft": "\u21B6", "curvearrowright": "\u21B7", "cuvee": "\u22CE", "cuwed": "\u22CF", "cwconint": "\u2232", "cwint": "\u2231", "cylcty": "\u232D", "dagger": "\u2020", "Dagger": "\u2021", "daleth": "\u2138", "darr": "\u2193", "Darr": "\u21A1", "dArr": "\u21D3", "dash": "\u2010", "Dashv": "\u2AE4", "dashv": "\u22A3", "dbkarow": "\u290F", "dblac": "\u02DD", "Dcaron": "\u010E", "dcaron": "\u010F", "Dcy": "\u0414", "dcy": "\u0434", "ddagger": "\u2021", "ddarr": "\u21CA", "DD": "\u2145", "dd": "\u2146", "DDotrahd": "\u2911", "ddotseq": "\u2A77", "deg": "\u00B0", "Del": "\u2207", "Delta": "\u0394", "delta": "\u03B4", "demptyv": "\u29B1", "dfisht": "\u297F", "Dfr": "\uD835\uDD07", "dfr": "\uD835\uDD21", "dHar": "\u2965", "dharl": "\u21C3", "dharr": "\u21C2", "DiacriticalAcute": "\u00B4", "DiacriticalDot": "\u02D9", "DiacriticalDoubleAcute": "\u02DD", "DiacriticalGrave": "`", "DiacriticalTilde": "\u02DC", "diam": "\u22C4", "diamond": "\u22C4", "Diamond": "\u22C4", "diamondsuit": "\u2666", "diams": "\u2666", "die": "\u00A8", "DifferentialD": "\u2146", "digamma": "\u03DD", "disin": "\u22F2", "div": "\u00F7", "divide": "\u00F7", "divideontimes": "\u22C7", "divonx": "\u22C7", "DJcy": "\u0402", "djcy": "\u0452", "dlcorn": "\u231E", "dlcrop": "\u230D", "dollar": "$", "Dopf": "\uD835\uDD3B", "dopf": "\uD835\uDD55", "Dot": "\u00A8", "dot": "\u02D9", "DotDot": "\u20DC", "doteq": "\u2250", "doteqdot": "\u2251", "DotEqual": "\u2250", "dotminus": "\u2238", "dotplus": "\u2214", "dotsquare": "\u22A1", "doublebarwedge": "\u2306", "DoubleContourIntegral": "\u222F", "DoubleDot": "\u00A8", "DoubleDownArrow": "\u21D3", "DoubleLeftArrow": "\u21D0", "DoubleLeftRightArrow": "\u21D4", "DoubleLeftTee": "\u2AE4", "DoubleLongLeftArrow": "\u27F8", "DoubleLongLeftRightArrow": "\u27FA", "DoubleLongRightArrow": "\u27F9", "DoubleRightArrow": "\u21D2", "DoubleRightTee": "\u22A8", "DoubleUpArrow": "\u21D1", "DoubleUpDownArrow": "\u21D5", "DoubleVerticalBar": "\u2225", "DownArrowBar": "\u2913", "downarrow": "\u2193", "DownArrow": "\u2193", "Downarrow": "\u21D3", "DownArrowUpArrow": "\u21F5", "DownBreve": "\u0311", "downdownarrows": "\u21CA", "downharpoonleft": "\u21C3", "downharpoonright": "\u21C2", "DownLeftRightVector": "\u2950", "DownLeftTeeVector": "\u295E", "DownLeftVectorBar": "\u2956", "DownLeftVector": "\u21BD", "DownRightTeeVector": "\u295F", "DownRightVectorBar": "\u2957", "DownRightVector": "\u21C1", "DownTeeArrow": "\u21A7", "DownTee": "\u22A4", "drbkarow": "\u2910", "drcorn": "\u231F", "drcrop": "\u230C", "Dscr": "\uD835\uDC9F", "dscr": "\uD835\uDCB9", "DScy": "\u0405", "dscy": "\u0455", "dsol": "\u29F6", "Dstrok": "\u0110", "dstrok": "\u0111", "dtdot": "\u22F1", "dtri": "\u25BF", "dtrif": "\u25BE", "duarr": "\u21F5", "duhar": "\u296F", "dwangle": "\u29A6", "DZcy": "\u040F", "dzcy": "\u045F", "dzigrarr": "\u27FF", "Eacute": "\u00C9", "eacute": "\u00E9", "easter": "\u2A6E", "Ecaron": "\u011A", "ecaron": "\u011B", "Ecirc": "\u00CA", "ecirc": "\u00EA", "ecir": "\u2256", "ecolon": "\u2255", "Ecy": "\u042D", "ecy": "\u044D", "eDDot": "\u2A77", "Edot": "\u0116", "edot": "\u0117", "eDot": "\u2251", "ee": "\u2147", "efDot": "\u2252", "Efr": "\uD835\uDD08", "efr": "\uD835\uDD22", "eg": "\u2A9A", "Egrave": "\u00C8", "egrave": "\u00E8", "egs": "\u2A96", "egsdot": "\u2A98", "el": "\u2A99", "Element": "\u2208", "elinters": "\u23E7", "ell": "\u2113", "els": "\u2A95", "elsdot": "\u2A97", "Emacr": "\u0112", "emacr": "\u0113", "empty": "\u2205", "emptyset": "\u2205", "EmptySmallSquare": "\u25FB", "emptyv": "\u2205", "EmptyVerySmallSquare": "\u25AB", "emsp13": "\u2004", "emsp14": "\u2005", "emsp": "\u2003", "ENG": "\u014A", "eng": "\u014B", "ensp": "\u2002", "Eogon": "\u0118", "eogon": "\u0119", "Eopf": "\uD835\uDD3C", "eopf": "\uD835\uDD56", "epar": "\u22D5", "eparsl": "\u29E3", "eplus": "\u2A71", "epsi": "\u03B5", "Epsilon": "\u0395", "epsilon": "\u03B5", "epsiv": "\u03F5", "eqcirc": "\u2256", "eqcolon": "\u2255", "eqsim": "\u2242", "eqslantgtr": "\u2A96", "eqslantless": "\u2A95", "Equal": "\u2A75", "equals": "=", "EqualTilde": "\u2242", "equest": "\u225F", "Equilibrium": "\u21CC", "equiv": "\u2261", "equivDD": "\u2A78", "eqvparsl": "\u29E5", "erarr": "\u2971", "erDot": "\u2253", "escr": "\u212F", "Escr": "\u2130", "esdot": "\u2250", "Esim": "\u2A73", "esim": "\u2242", "Eta": "\u0397", "eta": "\u03B7", "ETH": "\u00D0", "eth": "\u00F0", "Euml": "\u00CB", "euml": "\u00EB", "euro": "\u20AC", "excl": "!", "exist": "\u2203", "Exists": "\u2203", "expectation": "\u2130", "exponentiale": "\u2147", "ExponentialE": "\u2147", "fallingdotseq": "\u2252", "Fcy": "\u0424", "fcy": "\u0444", "female": "\u2640", "ffilig": "\uFB03", "fflig": "\uFB00", "ffllig": "\uFB04", "Ffr": "\uD835\uDD09", "ffr": "\uD835\uDD23", "filig": "\uFB01", "FilledSmallSquare": "\u25FC", "FilledVerySmallSquare": "\u25AA", "fjlig": "fj", "flat": "\u266D", "fllig": "\uFB02", "fltns": "\u25B1", "fnof": "\u0192", "Fopf": "\uD835\uDD3D", "fopf": "\uD835\uDD57", "forall": "\u2200", "ForAll": "\u2200", "fork": "\u22D4", "forkv": "\u2AD9", "Fouriertrf": "\u2131", "fpartint": "\u2A0D", "frac12": "\u00BD", "frac13": "\u2153", "frac14": "\u00BC", "frac15": "\u2155", "frac16": "\u2159", "frac18": "\u215B", "frac23": "\u2154", "frac25": "\u2156", "frac34": "\u00BE", "frac35": "\u2157", "frac38": "\u215C", "frac45": "\u2158", "frac56": "\u215A", "frac58": "\u215D", "frac78": "\u215E", "frasl": "\u2044", "frown": "\u2322", "fscr": "\uD835\uDCBB", "Fscr": "\u2131", "gacute": "\u01F5", "Gamma": "\u0393", "gamma": "\u03B3", "Gammad": "\u03DC", "gammad": "\u03DD", "gap": "\u2A86", "Gbreve": "\u011E", "gbreve": "\u011F", "Gcedil": "\u0122", "Gcirc": "\u011C", "gcirc": "\u011D", "Gcy": "\u0413", "gcy": "\u0433", "Gdot": "\u0120", "gdot": "\u0121", "ge": "\u2265", "gE": "\u2267", "gEl": "\u2A8C", "gel": "\u22DB", "geq": "\u2265", "geqq": "\u2267", "geqslant": "\u2A7E", "gescc": "\u2AA9", "ges": "\u2A7E", "gesdot": "\u2A80", "gesdoto": "\u2A82", "gesdotol": "\u2A84", "gesl": "\u22DB\uFE00", "gesles": "\u2A94", "Gfr": "\uD835\uDD0A", "gfr": "\uD835\uDD24", "gg": "\u226B", "Gg": "\u22D9", "ggg": "\u22D9", "gimel": "\u2137", "GJcy": "\u0403", "gjcy": "\u0453", "gla": "\u2AA5", "gl": "\u2277", "glE": "\u2A92", "glj": "\u2AA4", "gnap": "\u2A8A", "gnapprox": "\u2A8A", "gne": "\u2A88", "gnE": "\u2269", "gneq": "\u2A88", "gneqq": "\u2269", "gnsim": "\u22E7", "Gopf": "\uD835\uDD3E", "gopf": "\uD835\uDD58", "grave": "`", "GreaterEqual": "\u2265", "GreaterEqualLess": "\u22DB", "GreaterFullEqual": "\u2267", "GreaterGreater": "\u2AA2", "GreaterLess": "\u2277", "GreaterSlantEqual": "\u2A7E", "GreaterTilde": "\u2273", "Gscr": "\uD835\uDCA2", "gscr": "\u210A", "gsim": "\u2273", "gsime": "\u2A8E", "gsiml": "\u2A90", "gtcc": "\u2AA7", "gtcir": "\u2A7A", "gt": ">", "GT": ">", "Gt": "\u226B", "gtdot": "\u22D7", "gtlPar": "\u2995", "gtquest": "\u2A7C", "gtrapprox": "\u2A86", "gtrarr": "\u2978", "gtrdot": "\u22D7", "gtreqless": "\u22DB", "gtreqqless": "\u2A8C", "gtrless": "\u2277", "gtrsim": "\u2273", "gvertneqq": "\u2269\uFE00", "gvnE": "\u2269\uFE00", "Hacek": "\u02C7", "hairsp": "\u200A", "half": "\u00BD", "hamilt": "\u210B", "HARDcy": "\u042A", "hardcy": "\u044A", "harrcir": "\u2948", "harr": "\u2194", "hArr": "\u21D4", "harrw": "\u21AD", "Hat": "^", "hbar": "\u210F", "Hcirc": "\u0124", "hcirc": "\u0125", "hearts": "\u2665", "heartsuit": "\u2665", "hellip": "\u2026", "hercon": "\u22B9", "hfr": "\uD835\uDD25", "Hfr": "\u210C", "HilbertSpace": "\u210B", "hksearow": "\u2925", "hkswarow": "\u2926", "hoarr": "\u21FF", "homtht": "\u223B", "hookleftarrow": "\u21A9", "hookrightarrow": "\u21AA", "hopf": "\uD835\uDD59", "Hopf": "\u210D", "horbar": "\u2015", "HorizontalLine": "\u2500", "hscr": "\uD835\uDCBD", "Hscr": "\u210B", "hslash": "\u210F", "Hstrok": "\u0126", "hstrok": "\u0127", "HumpDownHump": "\u224E", "HumpEqual": "\u224F", "hybull": "\u2043", "hyphen": "\u2010", "Iacute": "\u00CD", "iacute": "\u00ED", "ic": "\u2063", "Icirc": "\u00CE", "icirc": "\u00EE", "Icy": "\u0418", "icy": "\u0438", "Idot": "\u0130", "IEcy": "\u0415", "iecy": "\u0435", "iexcl": "\u00A1", "iff": "\u21D4", "ifr": "\uD835\uDD26", "Ifr": "\u2111", "Igrave": "\u00CC", "igrave": "\u00EC", "ii": "\u2148", "iiiint": "\u2A0C", "iiint": "\u222D", "iinfin": "\u29DC", "iiota": "\u2129", "IJlig": "\u0132", "ijlig": "\u0133", "Imacr": "\u012A", "imacr": "\u012B", "image": "\u2111", "ImaginaryI": "\u2148", "imagline": "\u2110", "imagpart": "\u2111", "imath": "\u0131", "Im": "\u2111", "imof": "\u22B7", "imped": "\u01B5", "Implies": "\u21D2", "incare": "\u2105", "in": "\u2208", "infin": "\u221E", "infintie": "\u29DD", "inodot": "\u0131", "intcal": "\u22BA", "int": "\u222B", "Int": "\u222C", "integers": "\u2124", "Integral": "\u222B", "intercal": "\u22BA", "Intersection": "\u22C2", "intlarhk": "\u2A17", "intprod": "\u2A3C", "InvisibleComma": "\u2063", "InvisibleTimes": "\u2062", "IOcy": "\u0401", "iocy": "\u0451", "Iogon": "\u012E", "iogon": "\u012F", "Iopf": "\uD835\uDD40", "iopf": "\uD835\uDD5A", "Iota": "\u0399", "iota": "\u03B9", "iprod": "\u2A3C", "iquest": "\u00BF", "iscr": "\uD835\uDCBE", "Iscr": "\u2110", "isin": "\u2208", "isindot": "\u22F5", "isinE": "\u22F9", "isins": "\u22F4", "isinsv": "\u22F3", "isinv": "\u2208", "it": "\u2062", "Itilde": "\u0128", "itilde": "\u0129", "Iukcy": "\u0406", "iukcy": "\u0456", "Iuml": "\u00CF", "iuml": "\u00EF", "Jcirc": "\u0134", "jcirc": "\u0135", "Jcy": "\u0419", "jcy": "\u0439", "Jfr": "\uD835\uDD0D", "jfr": "\uD835\uDD27", "jmath": "\u0237", "Jopf": "\uD835\uDD41", "jopf": "\uD835\uDD5B", "Jscr": "\uD835\uDCA5", "jscr": "\uD835\uDCBF", "Jsercy": "\u0408", "jsercy": "\u0458", "Jukcy": "\u0404", "jukcy": "\u0454", "Kappa": "\u039A", "kappa": "\u03BA", "kappav": "\u03F0", "Kcedil": "\u0136", "kcedil": "\u0137", "Kcy": "\u041A", "kcy": "\u043A", "Kfr": "\uD835\uDD0E", "kfr": "\uD835\uDD28", "kgreen": "\u0138", "KHcy": "\u0425", "khcy": "\u0445", "KJcy": "\u040C", "kjcy": "\u045C", "Kopf": "\uD835\uDD42", "kopf": "\uD835\uDD5C", "Kscr": "\uD835\uDCA6", "kscr": "\uD835\uDCC0", "lAarr": "\u21DA", "Lacute": "\u0139", "lacute": "\u013A", "laemptyv": "\u29B4", "lagran": "\u2112", "Lambda": "\u039B", "lambda": "\u03BB", "lang": "\u27E8", "Lang": "\u27EA", "langd": "\u2991", "langle": "\u27E8", "lap": "\u2A85", "Laplacetrf": "\u2112", "laquo": "\u00AB", "larrb": "\u21E4", "larrbfs": "\u291F", "larr": "\u2190", "Larr": "\u219E", "lArr": "\u21D0", "larrfs": "\u291D", "larrhk": "\u21A9", "larrlp": "\u21AB", "larrpl": "\u2939", "larrsim": "\u2973", "larrtl": "\u21A2", "latail": "\u2919", "lAtail": "\u291B", "lat": "\u2AAB", "late": "\u2AAD", "lates": "\u2AAD\uFE00", "lbarr": "\u290C", "lBarr": "\u290E", "lbbrk": "\u2772", "lbrace": "{", "lbrack": "[", "lbrke": "\u298B", "lbrksld": "\u298F", "lbrkslu": "\u298D", "Lcaron": "\u013D", "lcaron": "\u013E", "Lcedil": "\u013B", "lcedil": "\u013C", "lceil": "\u2308", "lcub": "{", "Lcy": "\u041B", "lcy": "\u043B", "ldca": "\u2936", "ldquo": "\u201C", "ldquor": "\u201E", "ldrdhar": "\u2967", "ldrushar": "\u294B", "ldsh": "\u21B2", "le": "\u2264", "lE": "\u2266", "LeftAngleBracket": "\u27E8", "LeftArrowBar": "\u21E4", "leftarrow": "\u2190", "LeftArrow": "\u2190", "Leftarrow": "\u21D0", "LeftArrowRightArrow": "\u21C6", "leftarrowtail": "\u21A2", "LeftCeiling": "\u2308", "LeftDoubleBracket": "\u27E6", "LeftDownTeeVector": "\u2961", "LeftDownVectorBar": "\u2959", "LeftDownVector": "\u21C3", "LeftFloor": "\u230A", "leftharpoondown": "\u21BD", "leftharpoonup": "\u21BC", "leftleftarrows": "\u21C7", "leftrightarrow": "\u2194", "LeftRightArrow": "\u2194", "Leftrightarrow": "\u21D4", "leftrightarrows": "\u21C6", "leftrightharpoons": "\u21CB", "leftrightsquigarrow": "\u21AD", "LeftRightVector": "\u294E", "LeftTeeArrow": "\u21A4", "LeftTee": "\u22A3", "LeftTeeVector": "\u295A", "leftthreetimes": "\u22CB", "LeftTriangleBar": "\u29CF", "LeftTriangle": "\u22B2", "LeftTriangleEqual": "\u22B4", "LeftUpDownVector": "\u2951", "LeftUpTeeVector": "\u2960", "LeftUpVectorBar": "\u2958", "LeftUpVector": "\u21BF", "LeftVectorBar": "\u2952", "LeftVector": "\u21BC", "lEg": "\u2A8B", "leg": "\u22DA", "leq": "\u2264", "leqq": "\u2266", "leqslant": "\u2A7D", "lescc": "\u2AA8", "les": "\u2A7D", "lesdot": "\u2A7F", "lesdoto": "\u2A81", "lesdotor": "\u2A83", "lesg": "\u22DA\uFE00", "lesges": "\u2A93", "lessapprox": "\u2A85", "lessdot": "\u22D6", "lesseqgtr": "\u22DA", "lesseqqgtr": "\u2A8B", "LessEqualGreater": "\u22DA", "LessFullEqual": "\u2266", "LessGreater": "\u2276", "lessgtr": "\u2276", "LessLess": "\u2AA1", "lesssim": "\u2272", "LessSlantEqual": "\u2A7D", "LessTilde": "\u2272", "lfisht": "\u297C", "lfloor": "\u230A", "Lfr": "\uD835\uDD0F", "lfr": "\uD835\uDD29", "lg": "\u2276", "lgE": "\u2A91", "lHar": "\u2962", "lhard": "\u21BD", "lharu": "\u21BC", "lharul": "\u296A", "lhblk": "\u2584", "LJcy": "\u0409", "ljcy": "\u0459", "llarr": "\u21C7", "ll": "\u226A", "Ll": "\u22D8", "llcorner": "\u231E", "Lleftarrow": "\u21DA", "llhard": "\u296B", "lltri": "\u25FA", "Lmidot": "\u013F", "lmidot": "\u0140", "lmoustache": "\u23B0", "lmoust": "\u23B0", "lnap": "\u2A89", "lnapprox": "\u2A89", "lne": "\u2A87", "lnE": "\u2268", "lneq": "\u2A87", "lneqq": "\u2268", "lnsim": "\u22E6", "loang": "\u27EC", "loarr": "\u21FD", "lobrk": "\u27E6", "longleftarrow": "\u27F5", "LongLeftArrow": "\u27F5", "Longleftarrow": "\u27F8", "longleftrightarrow": "\u27F7", "LongLeftRightArrow": "\u27F7", "Longleftrightarrow": "\u27FA", "longmapsto": "\u27FC", "longrightarrow": "\u27F6", "LongRightArrow": "\u27F6", "Longrightarrow": "\u27F9", "looparrowleft": "\u21AB", "looparrowright": "\u21AC", "lopar": "\u2985", "Lopf": "\uD835\uDD43", "lopf": "\uD835\uDD5D", "loplus": "\u2A2D", "lotimes": "\u2A34", "lowast": "\u2217", "lowbar": "_", "LowerLeftArrow": "\u2199", "LowerRightArrow": "\u2198", "loz": "\u25CA", "lozenge": "\u25CA", "lozf": "\u29EB", "lpar": "(", "lparlt": "\u2993", "lrarr": "\u21C6", "lrcorner": "\u231F", "lrhar": "\u21CB", "lrhard": "\u296D", "lrm": "\u200E", "lrtri": "\u22BF", "lsaquo": "\u2039", "lscr": "\uD835\uDCC1", "Lscr": "\u2112", "lsh": "\u21B0", "Lsh": "\u21B0", "lsim": "\u2272", "lsime": "\u2A8D", "lsimg": "\u2A8F", "lsqb": "[", "lsquo": "\u2018", "lsquor": "\u201A", "Lstrok": "\u0141", "lstrok": "\u0142", "ltcc": "\u2AA6", "ltcir": "\u2A79", "lt": "<", "LT": "<", "Lt": "\u226A", "ltdot": "\u22D6", "lthree": "\u22CB", "ltimes": "\u22C9", "ltlarr": "\u2976", "ltquest": "\u2A7B", "ltri": "\u25C3", "ltrie": "\u22B4", "ltrif": "\u25C2", "ltrPar": "\u2996", "lurdshar": "\u294A", "luruhar": "\u2966", "lvertneqq": "\u2268\uFE00", "lvnE": "\u2268\uFE00", "macr": "\u00AF", "male": "\u2642", "malt": "\u2720", "maltese": "\u2720", "Map": "\u2905", "map": "\u21A6", "mapsto": "\u21A6", "mapstodown": "\u21A7", "mapstoleft": "\u21A4", "mapstoup": "\u21A5", "marker": "\u25AE", "mcomma": "\u2A29", "Mcy": "\u041C", "mcy": "\u043C", "mdash": "\u2014", "mDDot": "\u223A", "measuredangle": "\u2221", "MediumSpace": "\u205F", "Mellintrf": "\u2133", "Mfr": "\uD835\uDD10", "mfr": "\uD835\uDD2A", "mho": "\u2127", "micro": "\u00B5", "midast": "*", "midcir": "\u2AF0", "mid": "\u2223", "middot": "\u00B7", "minusb": "\u229F", "minus": "\u2212", "minusd": "\u2238", "minusdu": "\u2A2A", "MinusPlus": "\u2213", "mlcp": "\u2ADB", "mldr": "\u2026", "mnplus": "\u2213", "models": "\u22A7", "Mopf": "\uD835\uDD44", "mopf": "\uD835\uDD5E", "mp": "\u2213", "mscr": "\uD835\uDCC2", "Mscr": "\u2133", "mstpos": "\u223E", "Mu": "\u039C", "mu": "\u03BC", "multimap": "\u22B8", "mumap": "\u22B8", "nabla": "\u2207", "Nacute": "\u0143", "nacute": "\u0144", "nang": "\u2220\u20D2", "nap": "\u2249", "napE": "\u2A70\u0338", "napid": "\u224B\u0338", "napos": "\u0149", "napprox": "\u2249", "natural": "\u266E", "naturals": "\u2115", "natur": "\u266E", "nbsp": "\u00A0", "nbump": "\u224E\u0338", "nbumpe": "\u224F\u0338", "ncap": "\u2A43", "Ncaron": "\u0147", "ncaron": "\u0148", "Ncedil": "\u0145", "ncedil": "\u0146", "ncong": "\u2247", "ncongdot": "\u2A6D\u0338", "ncup": "\u2A42", "Ncy": "\u041D", "ncy": "\u043D", "ndash": "\u2013", "nearhk": "\u2924", "nearr": "\u2197", "neArr": "\u21D7", "nearrow": "\u2197", "ne": "\u2260", "nedot": "\u2250\u0338", "NegativeMediumSpace": "\u200B", "NegativeThickSpace": "\u200B", "NegativeThinSpace": "\u200B", "NegativeVeryThinSpace": "\u200B", "nequiv": "\u2262", "nesear": "\u2928", "nesim": "\u2242\u0338", "NestedGreaterGreater": "\u226B", "NestedLessLess": "\u226A", "NewLine": "\n", "nexist": "\u2204", "nexists": "\u2204", "Nfr": "\uD835\uDD11", "nfr": "\uD835\uDD2B", "ngE": "\u2267\u0338", "nge": "\u2271", "ngeq": "\u2271", "ngeqq": "\u2267\u0338", "ngeqslant": "\u2A7E\u0338", "nges": "\u2A7E\u0338", "nGg": "\u22D9\u0338", "ngsim": "\u2275", "nGt": "\u226B\u20D2", "ngt": "\u226F", "ngtr": "\u226F", "nGtv": "\u226B\u0338", "nharr": "\u21AE", "nhArr": "\u21CE", "nhpar": "\u2AF2", "ni": "\u220B", "nis": "\u22FC", "nisd": "\u22FA", "niv": "\u220B", "NJcy": "\u040A", "njcy": "\u045A", "nlarr": "\u219A", "nlArr": "\u21CD", "nldr": "\u2025", "nlE": "\u2266\u0338", "nle": "\u2270", "nleftarrow": "\u219A", "nLeftarrow": "\u21CD", "nleftrightarrow": "\u21AE", "nLeftrightarrow": "\u21CE", "nleq": "\u2270", "nleqq": "\u2266\u0338", "nleqslant": "\u2A7D\u0338", "nles": "\u2A7D\u0338", "nless": "\u226E", "nLl": "\u22D8\u0338", "nlsim": "\u2274", "nLt": "\u226A\u20D2", "nlt": "\u226E", "nltri": "\u22EA", "nltrie": "\u22EC", "nLtv": "\u226A\u0338", "nmid": "\u2224", "NoBreak": "\u2060", "NonBreakingSpace": "\u00A0", "nopf": "\uD835\uDD5F", "Nopf": "\u2115", "Not": "\u2AEC", "not": "\u00AC", "NotCongruent": "\u2262", "NotCupCap": "\u226D", "NotDoubleVerticalBar": "\u2226", "NotElement": "\u2209", "NotEqual": "\u2260", "NotEqualTilde": "\u2242\u0338", "NotExists": "\u2204", "NotGreater": "\u226F", "NotGreaterEqual": "\u2271", "NotGreaterFullEqual": "\u2267\u0338", "NotGreaterGreater": "\u226B\u0338", "NotGreaterLess": "\u2279", "NotGreaterSlantEqual": "\u2A7E\u0338", "NotGreaterTilde": "\u2275", "NotHumpDownHump": "\u224E\u0338", "NotHumpEqual": "\u224F\u0338", "notin": "\u2209", "notindot": "\u22F5\u0338", "notinE": "\u22F9\u0338", "notinva": "\u2209", "notinvb": "\u22F7", "notinvc": "\u22F6", "NotLeftTriangleBar": "\u29CF\u0338", "NotLeftTriangle": "\u22EA", "NotLeftTriangleEqual": "\u22EC", "NotLess": "\u226E", "NotLessEqual": "\u2270", "NotLessGreater": "\u2278", "NotLessLess": "\u226A\u0338", "NotLessSlantEqual": "\u2A7D\u0338", "NotLessTilde": "\u2274", "NotNestedGreaterGreater": "\u2AA2\u0338", "NotNestedLessLess": "\u2AA1\u0338", "notni": "\u220C", "notniva": "\u220C", "notnivb": "\u22FE", "notnivc": "\u22FD", "NotPrecedes": "\u2280", "NotPrecedesEqual": "\u2AAF\u0338", "NotPrecedesSlantEqual": "\u22E0", "NotReverseElement": "\u220C", "NotRightTriangleBar": "\u29D0\u0338", "NotRightTriangle": "\u22EB", "NotRightTriangleEqual": "\u22ED", "NotSquareSubset": "\u228F\u0338", "NotSquareSubsetEqual": "\u22E2", "NotSquareSuperset": "\u2290\u0338", "NotSquareSupersetEqual": "\u22E3", "NotSubset": "\u2282\u20D2", "NotSubsetEqual": "\u2288", "NotSucceeds": "\u2281", "NotSucceedsEqual": "\u2AB0\u0338", "NotSucceedsSlantEqual": "\u22E1", "NotSucceedsTilde": "\u227F\u0338", "NotSuperset": "\u2283\u20D2", "NotSupersetEqual": "\u2289", "NotTilde": "\u2241", "NotTildeEqual": "\u2244", "NotTildeFullEqual": "\u2247", "NotTildeTilde": "\u2249", "NotVerticalBar": "\u2224", "nparallel": "\u2226", "npar": "\u2226", "nparsl": "\u2AFD\u20E5", "npart": "\u2202\u0338", "npolint": "\u2A14", "npr": "\u2280", "nprcue": "\u22E0", "nprec": "\u2280", "npreceq": "\u2AAF\u0338", "npre": "\u2AAF\u0338", "nrarrc": "\u2933\u0338", "nrarr": "\u219B", "nrArr": "\u21CF", "nrarrw": "\u219D\u0338", "nrightarrow": "\u219B", "nRightarrow": "\u21CF", "nrtri": "\u22EB", "nrtrie": "\u22ED", "nsc": "\u2281", "nsccue": "\u22E1", "nsce": "\u2AB0\u0338", "Nscr": "\uD835\uDCA9", "nscr": "\uD835\uDCC3", "nshortmid": "\u2224", "nshortparallel": "\u2226", "nsim": "\u2241", "nsime": "\u2244", "nsimeq": "\u2244", "nsmid": "\u2224", "nspar": "\u2226", "nsqsube": "\u22E2", "nsqsupe": "\u22E3", "nsub": "\u2284", "nsubE": "\u2AC5\u0338", "nsube": "\u2288", "nsubset": "\u2282\u20D2", "nsubseteq": "\u2288", "nsubseteqq": "\u2AC5\u0338", "nsucc": "\u2281", "nsucceq": "\u2AB0\u0338", "nsup": "\u2285", "nsupE": "\u2AC6\u0338", "nsupe": "\u2289", "nsupset": "\u2283\u20D2", "nsupseteq": "\u2289", "nsupseteqq": "\u2AC6\u0338", "ntgl": "\u2279", "Ntilde": "\u00D1", "ntilde": "\u00F1", "ntlg": "\u2278", "ntriangleleft": "\u22EA", "ntrianglelefteq": "\u22EC", "ntriangleright": "\u22EB", "ntrianglerighteq": "\u22ED", "Nu": "\u039D", "nu": "\u03BD", "num": "#", "numero": "\u2116", "numsp": "\u2007", "nvap": "\u224D\u20D2", "nvdash": "\u22AC", "nvDash": "\u22AD", "nVdash": "\u22AE", "nVDash": "\u22AF", "nvge": "\u2265\u20D2", "nvgt": ">\u20D2", "nvHarr": "\u2904", "nvinfin": "\u29DE", "nvlArr": "\u2902", "nvle": "\u2264\u20D2", "nvlt": "<\u20D2", "nvltrie": "\u22B4\u20D2", "nvrArr": "\u2903", "nvrtrie": "\u22B5\u20D2", "nvsim": "\u223C\u20D2", "nwarhk": "\u2923", "nwarr": "\u2196", "nwArr": "\u21D6", "nwarrow": "\u2196", "nwnear": "\u2927", "Oacute": "\u00D3", "oacute": "\u00F3", "oast": "\u229B", "Ocirc": "\u00D4", "ocirc": "\u00F4", "ocir": "\u229A", "Ocy": "\u041E", "ocy": "\u043E", "odash": "\u229D", "Odblac": "\u0150", "odblac": "\u0151", "odiv": "\u2A38", "odot": "\u2299", "odsold": "\u29BC", "OElig": "\u0152", "oelig": "\u0153", "ofcir": "\u29BF", "Ofr": "\uD835\uDD12", "ofr": "\uD835\uDD2C", "ogon": "\u02DB", "Ograve": "\u00D2", "ograve": "\u00F2", "ogt": "\u29C1", "ohbar": "\u29B5", "ohm": "\u03A9", "oint": "\u222E", "olarr": "\u21BA", "olcir": "\u29BE", "olcross": "\u29BB", "oline": "\u203E", "olt": "\u29C0", "Omacr": "\u014C", "omacr": "\u014D", "Omega": "\u03A9", "omega": "\u03C9", "Omicron": "\u039F", "omicron": "\u03BF", "omid": "\u29B6", "ominus": "\u2296", "Oopf": "\uD835\uDD46", "oopf": "\uD835\uDD60", "opar": "\u29B7", "OpenCurlyDoubleQuote": "\u201C", "OpenCurlyQuote": "\u2018", "operp": "\u29B9", "oplus": "\u2295", "orarr": "\u21BB", "Or": "\u2A54", "or": "\u2228", "ord": "\u2A5D", "order": "\u2134", "orderof": "\u2134", "ordf": "\u00AA", "ordm": "\u00BA", "origof": "\u22B6", "oror": "\u2A56", "orslope": "\u2A57", "orv": "\u2A5B", "oS": "\u24C8", "Oscr": "\uD835\uDCAA", "oscr": "\u2134", "Oslash": "\u00D8", "oslash": "\u00F8", "osol": "\u2298", "Otilde": "\u00D5", "otilde": "\u00F5", "otimesas": "\u2A36", "Otimes": "\u2A37", "otimes": "\u2297", "Ouml": "\u00D6", "ouml": "\u00F6", "ovbar": "\u233D", "OverBar": "\u203E", "OverBrace": "\u23DE", "OverBracket": "\u23B4", "OverParenthesis": "\u23DC", "para": "\u00B6", "parallel": "\u2225", "par": "\u2225", "parsim": "\u2AF3", "parsl": "\u2AFD", "part": "\u2202", "PartialD": "\u2202", "Pcy": "\u041F", "pcy": "\u043F", "percnt": "%", "period": ".", "permil": "\u2030", "perp": "\u22A5", "pertenk": "\u2031", "Pfr": "\uD835\uDD13", "pfr": "\uD835\uDD2D", "Phi": "\u03A6", "phi": "\u03C6", "phiv": "\u03D5", "phmmat": "\u2133", "phone": "\u260E", "Pi": "\u03A0", "pi": "\u03C0", "pitchfork": "\u22D4", "piv": "\u03D6", "planck": "\u210F", "planckh": "\u210E", "plankv": "\u210F", "plusacir": "\u2A23", "plusb": "\u229E", "pluscir": "\u2A22", "plus": "+", "plusdo": "\u2214", "plusdu": "\u2A25", "pluse": "\u2A72", "PlusMinus": "\u00B1", "plusmn": "\u00B1", "plussim": "\u2A26", "plustwo": "\u2A27", "pm": "\u00B1", "Poincareplane": "\u210C", "pointint": "\u2A15", "popf": "\uD835\uDD61", "Popf": "\u2119", "pound": "\u00A3", "prap": "\u2AB7", "Pr": "\u2ABB", "pr": "\u227A", "prcue": "\u227C", "precapprox": "\u2AB7", "prec": "\u227A", "preccurlyeq": "\u227C", "Precedes": "\u227A", "PrecedesEqual": "\u2AAF", "PrecedesSlantEqual": "\u227C", "PrecedesTilde": "\u227E", "preceq": "\u2AAF", "precnapprox": "\u2AB9", "precneqq": "\u2AB5", "precnsim": "\u22E8", "pre": "\u2AAF", "prE": "\u2AB3", "precsim": "\u227E", "prime": "\u2032", "Prime": "\u2033", "primes": "\u2119", "prnap": "\u2AB9", "prnE": "\u2AB5", "prnsim": "\u22E8", "prod": "\u220F", "Product": "\u220F", "profalar": "\u232E", "profline": "\u2312", "profsurf": "\u2313", "prop": "\u221D", "Proportional": "\u221D", "Proportion": "\u2237", "propto": "\u221D", "prsim": "\u227E", "prurel": "\u22B0", "Pscr": "\uD835\uDCAB", "pscr": "\uD835\uDCC5", "Psi": "\u03A8", "psi": "\u03C8", "puncsp": "\u2008", "Qfr": "\uD835\uDD14", "qfr": "\uD835\uDD2E", "qint": "\u2A0C", "qopf": "\uD835\uDD62", "Qopf": "\u211A", "qprime": "\u2057", "Qscr": "\uD835\uDCAC", "qscr": "\uD835\uDCC6", "quaternions": "\u210D", "quatint": "\u2A16", "quest": "?", "questeq": "\u225F", "quot": "\"", "QUOT": "\"", "rAarr": "\u21DB", "race": "\u223D\u0331", "Racute": "\u0154", "racute": "\u0155", "radic": "\u221A", "raemptyv": "\u29B3", "rang": "\u27E9", "Rang": "\u27EB", "rangd": "\u2992", "range": "\u29A5", "rangle": "\u27E9", "raquo": "\u00BB", "rarrap": "\u2975", "rarrb": "\u21E5", "rarrbfs": "\u2920", "rarrc": "\u2933", "rarr": "\u2192", "Rarr": "\u21A0", "rArr": "\u21D2", "rarrfs": "\u291E", "rarrhk": "\u21AA", "rarrlp": "\u21AC", "rarrpl": "\u2945", "rarrsim": "\u2974", "Rarrtl": "\u2916", "rarrtl": "\u21A3", "rarrw": "\u219D", "ratail": "\u291A", "rAtail": "\u291C", "ratio": "\u2236", "rationals": "\u211A", "rbarr": "\u290D", "rBarr": "\u290F", "RBarr": "\u2910", "rbbrk": "\u2773", "rbrace": "}", "rbrack": "]", "rbrke": "\u298C", "rbrksld": "\u298E", "rbrkslu": "\u2990", "Rcaron": "\u0158", "rcaron": "\u0159", "Rcedil": "\u0156", "rcedil": "\u0157", "rceil": "\u2309", "rcub": "}", "Rcy": "\u0420", "rcy": "\u0440", "rdca": "\u2937", "rdldhar": "\u2969", "rdquo": "\u201D", "rdquor": "\u201D", "rdsh": "\u21B3", "real": "\u211C", "realine": "\u211B", "realpart": "\u211C", "reals": "\u211D", "Re": "\u211C", "rect": "\u25AD", "reg": "\u00AE", "REG": "\u00AE", "ReverseElement": "\u220B", "ReverseEquilibrium": "\u21CB", "ReverseUpEquilibrium": "\u296F", "rfisht": "\u297D", "rfloor": "\u230B", "rfr": "\uD835\uDD2F", "Rfr": "\u211C", "rHar": "\u2964", "rhard": "\u21C1", "rharu": "\u21C0", "rharul": "\u296C", "Rho": "\u03A1", "rho": "\u03C1", "rhov": "\u03F1", "RightAngleBracket": "\u27E9", "RightArrowBar": "\u21E5", "rightarrow": "\u2192", "RightArrow": "\u2192", "Rightarrow": "\u21D2", "RightArrowLeftArrow": "\u21C4", "rightarrowtail": "\u21A3", "RightCeiling": "\u2309", "RightDoubleBracket": "\u27E7", "RightDownTeeVector": "\u295D", "RightDownVectorBar": "\u2955", "RightDownVector": "\u21C2", "RightFloor": "\u230B", "rightharpoondown": "\u21C1", "rightharpoonup": "\u21C0", "rightleftarrows": "\u21C4", "rightleftharpoons": "\u21CC", "rightrightarrows": "\u21C9", "rightsquigarrow": "\u219D", "RightTeeArrow": "\u21A6", "RightTee": "\u22A2", "RightTeeVector": "\u295B", "rightthreetimes": "\u22CC", "RightTriangleBar": "\u29D0", "RightTriangle": "\u22B3", "RightTriangleEqual": "\u22B5", "RightUpDownVector": "\u294F", "RightUpTeeVector": "\u295C", "RightUpVectorBar": "\u2954", "RightUpVector": "\u21BE", "RightVectorBar": "\u2953", "RightVector": "\u21C0", "ring": "\u02DA", "risingdotseq": "\u2253", "rlarr": "\u21C4", "rlhar": "\u21CC", "rlm": "\u200F", "rmoustache": "\u23B1", "rmoust": "\u23B1", "rnmid": "\u2AEE", "roang": "\u27ED", "roarr": "\u21FE", "robrk": "\u27E7", "ropar": "\u2986", "ropf": "\uD835\uDD63", "Ropf": "\u211D", "roplus": "\u2A2E", "rotimes": "\u2A35", "RoundImplies": "\u2970", "rpar": ")", "rpargt": "\u2994", "rppolint": "\u2A12", "rrarr": "\u21C9", "Rrightarrow": "\u21DB", "rsaquo": "\u203A", "rscr": "\uD835\uDCC7", "Rscr": "\u211B", "rsh": "\u21B1", "Rsh": "\u21B1", "rsqb": "]", "rsquo": "\u2019", "rsquor": "\u2019", "rthree": "\u22CC", "rtimes": "\u22CA", "rtri": "\u25B9", "rtrie": "\u22B5", "rtrif": "\u25B8", "rtriltri": "\u29CE", "RuleDelayed": "\u29F4", "ruluhar": "\u2968", "rx": "\u211E", "Sacute": "\u015A", "sacute": "\u015B", "sbquo": "\u201A", "scap": "\u2AB8", "Scaron": "\u0160", "scaron": "\u0161", "Sc": "\u2ABC", "sc": "\u227B", "sccue": "\u227D", "sce": "\u2AB0", "scE": "\u2AB4", "Scedil": "\u015E", "scedil": "\u015F", "Scirc": "\u015C", "scirc": "\u015D", "scnap": "\u2ABA", "scnE": "\u2AB6", "scnsim": "\u22E9", "scpolint": "\u2A13", "scsim": "\u227F", "Scy": "\u0421", "scy": "\u0441", "sdotb": "\u22A1", "sdot": "\u22C5", "sdote": "\u2A66", "searhk": "\u2925", "searr": "\u2198", "seArr": "\u21D8", "searrow": "\u2198", "sect": "\u00A7", "semi": ";", "seswar": "\u2929", "setminus": "\u2216", "setmn": "\u2216", "sext": "\u2736", "Sfr": "\uD835\uDD16", "sfr": "\uD835\uDD30", "sfrown": "\u2322", "sharp": "\u266F", "SHCHcy": "\u0429", "shchcy": "\u0449", "SHcy": "\u0428", "shcy": "\u0448", "ShortDownArrow": "\u2193", "ShortLeftArrow": "\u2190", "shortmid": "\u2223", "shortparallel": "\u2225", "ShortRightArrow": "\u2192", "ShortUpArrow": "\u2191", "shy": "\u00AD", "Sigma": "\u03A3", "sigma": "\u03C3", "sigmaf": "\u03C2", "sigmav": "\u03C2", "sim": "\u223C", "simdot": "\u2A6A", "sime": "\u2243", "simeq": "\u2243", "simg": "\u2A9E", "simgE": "\u2AA0", "siml": "\u2A9D", "simlE": "\u2A9F", "simne": "\u2246", "simplus": "\u2A24", "simrarr": "\u2972", "slarr": "\u2190", "SmallCircle": "\u2218", "smallsetminus": "\u2216", "smashp": "\u2A33", "smeparsl": "\u29E4", "smid": "\u2223", "smile": "\u2323", "smt": "\u2AAA", "smte": "\u2AAC", "smtes": "\u2AAC\uFE00", "SOFTcy": "\u042C", "softcy": "\u044C", "solbar": "\u233F", "solb": "\u29C4", "sol": "/", "Sopf": "\uD835\uDD4A", "sopf": "\uD835\uDD64", "spades": "\u2660", "spadesuit": "\u2660", "spar": "\u2225", "sqcap": "\u2293", "sqcaps": "\u2293\uFE00", "sqcup": "\u2294", "sqcups": "\u2294\uFE00", "Sqrt": "\u221A", "sqsub": "\u228F", "sqsube": "\u2291", "sqsubset": "\u228F", "sqsubseteq": "\u2291", "sqsup": "\u2290", "sqsupe": "\u2292", "sqsupset": "\u2290", "sqsupseteq": "\u2292", "square": "\u25A1", "Square": "\u25A1", "SquareIntersection": "\u2293", "SquareSubset": "\u228F", "SquareSubsetEqual": "\u2291", "SquareSuperset": "\u2290", "SquareSupersetEqual": "\u2292", "SquareUnion": "\u2294", "squarf": "\u25AA", "squ": "\u25A1", "squf": "\u25AA", "srarr": "\u2192", "Sscr": "\uD835\uDCAE", "sscr": "\uD835\uDCC8", "ssetmn": "\u2216", "ssmile": "\u2323", "sstarf": "\u22C6", "Star": "\u22C6", "star": "\u2606", "starf": "\u2605", "straightepsilon": "\u03F5", "straightphi": "\u03D5", "strns": "\u00AF", "sub": "\u2282", "Sub": "\u22D0", "subdot": "\u2ABD", "subE": "\u2AC5", "sube": "\u2286", "subedot": "\u2AC3", "submult": "\u2AC1", "subnE": "\u2ACB", "subne": "\u228A", "subplus": "\u2ABF", "subrarr": "\u2979", "subset": "\u2282", "Subset": "\u22D0", "subseteq": "\u2286", "subseteqq": "\u2AC5", "SubsetEqual": "\u2286", "subsetneq": "\u228A", "subsetneqq": "\u2ACB", "subsim": "\u2AC7", "subsub": "\u2AD5", "subsup": "\u2AD3", "succapprox": "\u2AB8", "succ": "\u227B", "succcurlyeq": "\u227D", "Succeeds": "\u227B", "SucceedsEqual": "\u2AB0", "SucceedsSlantEqual": "\u227D", "SucceedsTilde": "\u227F", "succeq": "\u2AB0", "succnapprox": "\u2ABA", "succneqq": "\u2AB6", "succnsim": "\u22E9", "succsim": "\u227F", "SuchThat": "\u220B", "sum": "\u2211", "Sum": "\u2211", "sung": "\u266A", "sup1": "\u00B9", "sup2": "\u00B2", "sup3": "\u00B3", "sup": "\u2283", "Sup": "\u22D1", "supdot": "\u2ABE", "supdsub": "\u2AD8", "supE": "\u2AC6", "supe": "\u2287", "supedot": "\u2AC4", "Superset": "\u2283", "SupersetEqual": "\u2287", "suphsol": "\u27C9", "suphsub": "\u2AD7", "suplarr": "\u297B", "supmult": "\u2AC2", "supnE": "\u2ACC", "supne": "\u228B", "supplus": "\u2AC0", "supset": "\u2283", "Supset": "\u22D1", "supseteq": "\u2287", "supseteqq": "\u2AC6", "supsetneq": "\u228B", "supsetneqq": "\u2ACC", "supsim": "\u2AC8", "supsub": "\u2AD4", "supsup": "\u2AD6", "swarhk": "\u2926", "swarr": "\u2199", "swArr": "\u21D9", "swarrow": "\u2199", "swnwar": "\u292A", "szlig": "\u00DF", "Tab": "\t", "target": "\u2316", "Tau": "\u03A4", "tau": "\u03C4", "tbrk": "\u23B4", "Tcaron": "\u0164", "tcaron": "\u0165", "Tcedil": "\u0162", "tcedil": "\u0163", "Tcy": "\u0422", "tcy": "\u0442", "tdot": "\u20DB", "telrec": "\u2315", "Tfr": "\uD835\uDD17", "tfr": "\uD835\uDD31", "there4": "\u2234", "therefore": "\u2234", "Therefore": "\u2234", "Theta": "\u0398", "theta": "\u03B8", "thetasym": "\u03D1", "thetav": "\u03D1", "thickapprox": "\u2248", "thicksim": "\u223C", "ThickSpace": "\u205F\u200A", "ThinSpace": "\u2009", "thinsp": "\u2009", "thkap": "\u2248", "thksim": "\u223C", "THORN": "\u00DE", "thorn": "\u00FE", "tilde": "\u02DC", "Tilde": "\u223C", "TildeEqual": "\u2243", "TildeFullEqual": "\u2245", "TildeTilde": "\u2248", "timesbar": "\u2A31", "timesb": "\u22A0", "times": "\u00D7", "timesd": "\u2A30", "tint": "\u222D", "toea": "\u2928", "topbot": "\u2336", "topcir": "\u2AF1", "top": "\u22A4", "Topf": "\uD835\uDD4B", "topf": "\uD835\uDD65", "topfork": "\u2ADA", "tosa": "\u2929", "tprime": "\u2034", "trade": "\u2122", "TRADE": "\u2122", "triangle": "\u25B5", "triangledown": "\u25BF", "triangleleft": "\u25C3", "trianglelefteq": "\u22B4", "triangleq": "\u225C", "triangleright": "\u25B9", "trianglerighteq": "\u22B5", "tridot": "\u25EC", "trie": "\u225C", "triminus": "\u2A3A", "TripleDot": "\u20DB", "triplus": "\u2A39", "trisb": "\u29CD", "tritime": "\u2A3B", "trpezium": "\u23E2", "Tscr": "\uD835\uDCAF", "tscr": "\uD835\uDCC9", "TScy": "\u0426", "tscy": "\u0446", "TSHcy": "\u040B", "tshcy": "\u045B", "Tstrok": "\u0166", "tstrok": "\u0167", "twixt": "\u226C", "twoheadleftarrow": "\u219E", "twoheadrightarrow": "\u21A0", "Uacute": "\u00DA", "uacute": "\u00FA", "uarr": "\u2191", "Uarr": "\u219F", "uArr": "\u21D1", "Uarrocir": "\u2949", "Ubrcy": "\u040E", "ubrcy": "\u045E", "Ubreve": "\u016C", "ubreve": "\u016D", "Ucirc": "\u00DB", "ucirc": "\u00FB", "Ucy": "\u0423", "ucy": "\u0443", "udarr": "\u21C5", "Udblac": "\u0170", "udblac": "\u0171", "udhar": "\u296E", "ufisht": "\u297E", "Ufr": "\uD835\uDD18", "ufr": "\uD835\uDD32", "Ugrave": "\u00D9", "ugrave": "\u00F9", "uHar": "\u2963", "uharl": "\u21BF", "uharr": "\u21BE", "uhblk": "\u2580", "ulcorn": "\u231C", "ulcorner": "\u231C", "ulcrop": "\u230F", "ultri": "\u25F8", "Umacr": "\u016A", "umacr": "\u016B", "uml": "\u00A8", "UnderBar": "_", "UnderBrace": "\u23DF", "UnderBracket": "\u23B5", "UnderParenthesis": "\u23DD", "Union": "\u22C3", "UnionPlus": "\u228E", "Uogon": "\u0172", "uogon": "\u0173", "Uopf": "\uD835\uDD4C", "uopf": "\uD835\uDD66", "UpArrowBar": "\u2912", "uparrow": "\u2191", "UpArrow": "\u2191", "Uparrow": "\u21D1", "UpArrowDownArrow": "\u21C5", "updownarrow": "\u2195", "UpDownArrow": "\u2195", "Updownarrow": "\u21D5", "UpEquilibrium": "\u296E", "upharpoonleft": "\u21BF", "upharpoonright": "\u21BE", "uplus": "\u228E", "UpperLeftArrow": "\u2196", "UpperRightArrow": "\u2197", "upsi": "\u03C5", "Upsi": "\u03D2", "upsih": "\u03D2", "Upsilon": "\u03A5", "upsilon": "\u03C5", "UpTeeArrow": "\u21A5", "UpTee": "\u22A5", "upuparrows": "\u21C8", "urcorn": "\u231D", "urcorner": "\u231D", "urcrop": "\u230E", "Uring": "\u016E", "uring": "\u016F", "urtri": "\u25F9", "Uscr": "\uD835\uDCB0", "uscr": "\uD835\uDCCA", "utdot": "\u22F0", "Utilde": "\u0168", "utilde": "\u0169", "utri": "\u25B5", "utrif": "\u25B4", "uuarr": "\u21C8", "Uuml": "\u00DC", "uuml": "\u00FC", "uwangle": "\u29A7", "vangrt": "\u299C", "varepsilon": "\u03F5", "varkappa": "\u03F0", "varnothing": "\u2205", "varphi": "\u03D5", "varpi": "\u03D6", "varpropto": "\u221D", "varr": "\u2195", "vArr": "\u21D5", "varrho": "\u03F1", "varsigma": "\u03C2", "varsubsetneq": "\u228A\uFE00", "varsubsetneqq": "\u2ACB\uFE00", "varsupsetneq": "\u228B\uFE00", "varsupsetneqq": "\u2ACC\uFE00", "vartheta": "\u03D1", "vartriangleleft": "\u22B2", "vartriangleright": "\u22B3", "vBar": "\u2AE8", "Vbar": "\u2AEB", "vBarv": "\u2AE9", "Vcy": "\u0412", "vcy": "\u0432", "vdash": "\u22A2", "vDash": "\u22A8", "Vdash": "\u22A9", "VDash": "\u22AB", "Vdashl": "\u2AE6", "veebar": "\u22BB", "vee": "\u2228", "Vee": "\u22C1", "veeeq": "\u225A", "vellip": "\u22EE", "verbar": "|", "Verbar": "\u2016", "vert": "|", "Vert": "\u2016", "VerticalBar": "\u2223", "VerticalLine": "|", "VerticalSeparator": "\u2758", "VerticalTilde": "\u2240", "VeryThinSpace": "\u200A", "Vfr": "\uD835\uDD19", "vfr": "\uD835\uDD33", "vltri": "\u22B2", "vnsub": "\u2282\u20D2", "vnsup": "\u2283\u20D2", "Vopf": "\uD835\uDD4D", "vopf": "\uD835\uDD67", "vprop": "\u221D", "vrtri": "\u22B3", "Vscr": "\uD835\uDCB1", "vscr": "\uD835\uDCCB", "vsubnE": "\u2ACB\uFE00", "vsubne": "\u228A\uFE00", "vsupnE": "\u2ACC\uFE00", "vsupne": "\u228B\uFE00", "Vvdash": "\u22AA", "vzigzag": "\u299A", "Wcirc": "\u0174", "wcirc": "\u0175", "wedbar": "\u2A5F", "wedge": "\u2227", "Wedge": "\u22C0", "wedgeq": "\u2259", "weierp": "\u2118", "Wfr": "\uD835\uDD1A", "wfr": "\uD835\uDD34", "Wopf": "\uD835\uDD4E", "wopf": "\uD835\uDD68", "wp": "\u2118", "wr": "\u2240", "wreath": "\u2240", "Wscr": "\uD835\uDCB2", "wscr": "\uD835\uDCCC", "xcap": "\u22C2", "xcirc": "\u25EF", "xcup": "\u22C3", "xdtri": "\u25BD", "Xfr": "\uD835\uDD1B", "xfr": "\uD835\uDD35", "xharr": "\u27F7", "xhArr": "\u27FA", "Xi": "\u039E", "xi": "\u03BE", "xlarr": "\u27F5", "xlArr": "\u27F8", "xmap": "\u27FC", "xnis": "\u22FB", "xodot": "\u2A00", "Xopf": "\uD835\uDD4F", "xopf": "\uD835\uDD69", "xoplus": "\u2A01", "xotime": "\u2A02", "xrarr": "\u27F6", "xrArr": "\u27F9", "Xscr": "\uD835\uDCB3", "xscr": "\uD835\uDCCD", "xsqcup": "\u2A06", "xuplus": "\u2A04", "xutri": "\u25B3", "xvee": "\u22C1", "xwedge": "\u22C0", "Yacute": "\u00DD", "yacute": "\u00FD", "YAcy": "\u042F", "yacy": "\u044F", "Ycirc": "\u0176", "ycirc": "\u0177", "Ycy": "\u042B", "ycy": "\u044B", "yen": "\u00A5", "Yfr": "\uD835\uDD1C", "yfr": "\uD835\uDD36", "YIcy": "\u0407", "yicy": "\u0457", "Yopf": "\uD835\uDD50", "yopf": "\uD835\uDD6A", "Yscr": "\uD835\uDCB4", "yscr": "\uD835\uDCCE", "YUcy": "\u042E", "yucy": "\u044E", "yuml": "\u00FF", "Yuml": "\u0178", "Zacute": "\u0179", "zacute": "\u017A", "Zcaron": "\u017D", "zcaron": "\u017E", "Zcy": "\u0417", "zcy": "\u0437", "Zdot": "\u017B", "zdot": "\u017C", "zeetrf": "\u2128", "ZeroWidthSpace": "\u200B", "Zeta": "\u0396", "zeta": "\u03B6", "zfr": "\uD835\uDD37", "Zfr": "\u2128", "ZHcy": "\u0416", "zhcy": "\u0436", "zigrarr": "\u21DD", "zopf": "\uD835\uDD6B", "Zopf": "\u2124", "Zscr": "\uD835\uDCB5", "zscr": "\uD835\uDCCF", "zwj": "\u200D", "zwnj": "\u200C" };
      
      },{}],53:[function(require,module,exports){
      
      
      ////////////////////////////////////////////////////////////////////////////////
      // Helpers
      
      // Merge objects
      //
      function assign(obj /*from1, from2, from3, ...*/) {
        var sources = Array.prototype.slice.call(arguments, 1);
      
        sources.forEach(function (source) {
          if (!source) { return; }
      
          Object.keys(source).forEach(function (key) {
            obj[key] = source[key];
          });
        });
      
        return obj;
      }
      
      function _class(obj) { return Object.prototype.toString.call(obj); }
      function isString(obj) { return _class(obj) === '[object String]'; }
      function isObject(obj) { return _class(obj) === '[object Object]'; }
      function isRegExp(obj) { return _class(obj) === '[object RegExp]'; }
      function isFunction(obj) { return _class(obj) === '[object Function]'; }
      
      
      function escapeRE(str) { return str.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&'); }
      
      ////////////////////////////////////////////////////////////////////////////////
      
      
      var defaultOptions = {
        fuzzyLink: true,
        fuzzyEmail: true,
        fuzzyIP: false
      };
      
      
      function isOptionsObj(obj) {
        return Object.keys(obj || {}).reduce(function (acc, k) {
          return acc || defaultOptions.hasOwnProperty(k);
        }, false);
      }
      
      
      var defaultSchemas = {
        'http:': {
          validate: function (text, pos, self) {
            var tail = text.slice(pos);
      
            if (!self.re.http) {
              // compile lazily, because "host"-containing variables can change on tlds update.
              self.re.http =  new RegExp(
                '^\\/\\/' + self.re.src_auth + self.re.src_host_port_strict + self.re.src_path, 'i'
              );
            }
            if (self.re.http.test(tail)) {
              return tail.match(self.re.http)[0].length;
            }
            return 0;
          }
        },
        'https:':  'http:',
        'ftp:':    'http:',
        '//':      {
          validate: function (text, pos, self) {
            var tail = text.slice(pos);
      
            if (!self.re.no_http) {
            // compile lazily, because "host"-containing variables can change on tlds update.
              self.re.no_http =  new RegExp(
                '^' +
                self.re.src_auth +
                // Don't allow single-level domains, because of false positives like '//test'
                // with code comments
                '(?:localhost|(?:(?:' + self.re.src_domain + ')\\.)+' + self.re.src_domain_root + ')' +
                self.re.src_port +
                self.re.src_host_terminator +
                self.re.src_path,
      
                'i'
              );
            }
      
            if (self.re.no_http.test(tail)) {
              // should not be `://` & `///`, that protects from errors in protocol name
              if (pos >= 3 && text[pos - 3] === ':') { return 0; }
              if (pos >= 3 && text[pos - 3] === '/') { return 0; }
              return tail.match(self.re.no_http)[0].length;
            }
            return 0;
          }
        },
        'mailto:': {
          validate: function (text, pos, self) {
            var tail = text.slice(pos);
      
            if (!self.re.mailto) {
              self.re.mailto =  new RegExp(
                '^' + self.re.src_email_name + '@' + self.re.src_host_strict, 'i'
              );
            }
            if (self.re.mailto.test(tail)) {
              return tail.match(self.re.mailto)[0].length;
            }
            return 0;
          }
        }
      };
      
      /*eslint-disable max-len*/
      
      // RE pattern for 2-character tlds (autogenerated by ./support/tlds_2char_gen.js)
      var tlds_2ch_src_re = 'a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]';
      
      // DON'T try to make PRs with changes. Extend TLDs with LinkifyIt.tlds() instead
      var tlds_default = 'biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф'.split('|');
      
      /*eslint-enable max-len*/
      
      ////////////////////////////////////////////////////////////////////////////////
      
      function resetScanCache(self) {
        self.__index__ = -1;
        self.__text_cache__   = '';
      }
      
      function createValidator(re) {
        return function (text, pos) {
          var tail = text.slice(pos);
      
          if (re.test(tail)) {
            return tail.match(re)[0].length;
          }
          return 0;
        };
      }
      
      function createNormalizer() {
        return function (match, self) {
          self.normalize(match);
        };
      }
      
      // Schemas compiler. Build regexps.
      //
      function compile(self) {
      
        // Load & clone RE patterns.
        var re = self.re = require('./lib/re')(self.__opts__);
      
        // Define dynamic patterns
        var tlds = self.__tlds__.slice();
      
        self.onCompile();
      
        if (!self.__tlds_replaced__) {
          tlds.push(tlds_2ch_src_re);
        }
        tlds.push(re.src_xn);
      
        re.src_tlds = tlds.join('|');
      
        function untpl(tpl) { return tpl.replace('%TLDS%', re.src_tlds); }
      
        re.email_fuzzy      = RegExp(untpl(re.tpl_email_fuzzy), 'i');
        re.link_fuzzy       = RegExp(untpl(re.tpl_link_fuzzy), 'i');
        re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), 'i');
        re.host_fuzzy_test  = RegExp(untpl(re.tpl_host_fuzzy_test), 'i');
      
        //
        // Compile each schema
        //
      
        var aliases = [];
      
        self.__compiled__ = {}; // Reset compiled data
      
        function schemaError(name, val) {
          throw new Error('(LinkifyIt) Invalid schema "' + name + '": ' + val);
        }
      
        Object.keys(self.__schemas__).forEach(function (name) {
          var val = self.__schemas__[name];
      
          // skip disabled methods
          if (val === null) { return; }
      
          var compiled = { validate: null, link: null };
      
          self.__compiled__[name] = compiled;
      
          if (isObject(val)) {
            if (isRegExp(val.validate)) {
              compiled.validate = createValidator(val.validate);
            } else if (isFunction(val.validate)) {
              compiled.validate = val.validate;
            } else {
              schemaError(name, val);
            }
      
            if (isFunction(val.normalize)) {
              compiled.normalize = val.normalize;
            } else if (!val.normalize) {
              compiled.normalize = createNormalizer();
            } else {
              schemaError(name, val);
            }
      
            return;
          }
      
          if (isString(val)) {
            aliases.push(name);
            return;
          }
      
          schemaError(name, val);
        });
      
        //
        // Compile postponed aliases
        //
      
        aliases.forEach(function (alias) {
          if (!self.__compiled__[self.__schemas__[alias]]) {
            // Silently fail on missed schemas to avoid errons on disable.
            // schemaError(alias, self.__schemas__[alias]);
            return;
          }
      
          self.__compiled__[alias].validate =
            self.__compiled__[self.__schemas__[alias]].validate;
          self.__compiled__[alias].normalize =
            self.__compiled__[self.__schemas__[alias]].normalize;
        });
      
        //
        // Fake record for guessed links
        //
        self.__compiled__[''] = { validate: null, normalize: createNormalizer() };
      
        //
        // Build schema condition
        //
        var slist = Object.keys(self.__compiled__)
                            .filter(function (name) {
                              // Filter disabled & fake schemas
                              return name.length > 0 && self.__compiled__[name];
                            })
                            .map(escapeRE)
                            .join('|');
        // (?!_) cause 1.5x slowdown
        self.re.schema_test   = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'i');
        self.re.schema_search = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'ig');
      
        self.re.pretest = RegExp(
          '(' + self.re.schema_test.source + ')|(' + self.re.host_fuzzy_test.source + ')|@',
          'i'
        );
      
        //
        // Cleanup
        //
      
        resetScanCache(self);
      }
      
      /**
       * class Match
       *
       * Match result. Single element of array, returned by [[LinkifyIt#match]]
       **/
      function Match(self, shift) {
        var start = self.__index__,
            end   = self.__last_index__,
            text  = self.__text_cache__.slice(start, end);
      
        /**
         * Match#schema -> String
         *
         * Prefix (protocol) for matched string.
         **/
        this.schema    = self.__schema__.toLowerCase();
        /**
         * Match#index -> Number
         *
         * First position of matched string.
         **/
        this.index     = start + shift;
        /**
         * Match#lastIndex -> Number
         *
         * Next position after matched string.
         **/
        this.lastIndex = end + shift;
        /**
         * Match#raw -> String
         *
         * Matched string.
         **/
        this.raw       = text;
        /**
         * Match#text -> String
         *
         * Notmalized text of matched string.
         **/
        this.text      = text;
        /**
         * Match#url -> String
         *
         * Normalized url of matched string.
         **/
        this.url       = text;
      }
      
      function createMatch(self, shift) {
        var match = new Match(self, shift);
      
        self.__compiled__[match.schema].normalize(match, self);
      
        return match;
      }
      
      
      /**
       * class LinkifyIt
       **/
      
      /**
       * new LinkifyIt(schemas, options)
       * - schemas (Object): Optional. Additional schemas to validate (prefix/validator)
       * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
       *
       * Creates new linkifier instance with optional additional schemas.
       * Can be called without `new` keyword for convenience.
       *
       * By default understands:
       *
       * - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
       * - "fuzzy" links and emails (example.com, foo@bar.com).
       *
       * `schemas` is an object, where each key/value describes protocol/rule:
       *
       * - __key__ - link prefix (usually, protocol name with `:` at the end, `skype:`
       *   for example). `linkify-it` makes shure that prefix is not preceeded with
       *   alphanumeric char and symbols. Only whitespaces and punctuation allowed.
       * - __value__ - rule to check tail after link prefix
       *   - _String_ - just alias to existing rule
       *   - _Object_
       *     - _validate_ - validator function (should return matched length on success),
       *       or `RegExp`.
       *     - _normalize_ - optional function to normalize text & url of matched result
       *       (for example, for @twitter mentions).
       *
       * `options`:
       *
       * - __fuzzyLink__ - recognige URL-s without `http(s):` prefix. Default `true`.
       * - __fuzzyIP__ - allow IPs in fuzzy links above. Can conflict with some texts
       *   like version numbers. Default `false`.
       * - __fuzzyEmail__ - recognize emails without `mailto:` prefix.
       *
       **/
      function LinkifyIt(schemas, options) {
        if (!(this instanceof LinkifyIt)) {
          return new LinkifyIt(schemas, options);
        }
      
        if (!options) {
          if (isOptionsObj(schemas)) {
            options = schemas;
            schemas = {};
          }
        }
      
        this.__opts__           = assign({}, defaultOptions, options);
      
        // Cache last tested result. Used to skip repeating steps on next `match` call.
        this.__index__          = -1;
        this.__last_index__     = -1; // Next scan position
        this.__schema__         = '';
        this.__text_cache__     = '';
      
        this.__schemas__        = assign({}, defaultSchemas, schemas);
        this.__compiled__       = {};
      
        this.__tlds__           = tlds_default;
        this.__tlds_replaced__  = false;
      
        this.re = {};
      
        compile(this);
      }
      
      
      /** chainable
       * LinkifyIt#add(schema, definition)
       * - schema (String): rule name (fixed pattern prefix)
       * - definition (String|RegExp|Object): schema definition
       *
       * Add new rule definition. See constructor description for details.
       **/
      LinkifyIt.prototype.add = function add(schema, definition) {
        this.__schemas__[schema] = definition;
        compile(this);
        return this;
      };
      
      
      /** chainable
       * LinkifyIt#set(options)
       * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
       *
       * Set recognition options for links without schema.
       **/
      LinkifyIt.prototype.set = function set(options) {
        this.__opts__ = assign(this.__opts__, options);
        return this;
      };
      
      
      /**
       * LinkifyIt#test(text) -> Boolean
       *
       * Searches linkifiable pattern and returns `true` on success or `false` on fail.
       **/
      LinkifyIt.prototype.test = function test(text) {
        // Reset scan cache
        this.__text_cache__ = text;
        this.__index__      = -1;
      
        if (!text.length) { return false; }
      
        var m, ml, me, len, shift, next, re, tld_pos, at_pos;
      
        // try to scan for link with schema - that's the most simple rule
        if (this.re.schema_test.test(text)) {
          re = this.re.schema_search;
          re.lastIndex = 0;
          while ((m = re.exec(text)) !== null) {
            len = this.testSchemaAt(text, m[2], re.lastIndex);
            if (len) {
              this.__schema__     = m[2];
              this.__index__      = m.index + m[1].length;
              this.__last_index__ = m.index + m[0].length + len;
              break;
            }
          }
        }
      
        if (this.__opts__.fuzzyLink && this.__compiled__['http:']) {
          // guess schemaless links
          tld_pos = text.search(this.re.host_fuzzy_test);
          if (tld_pos >= 0) {
            // if tld is located after found link - no need to check fuzzy pattern
            if (this.__index__ < 0 || tld_pos < this.__index__) {
              if ((ml = text.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy)) !== null) {
      
                shift = ml.index + ml[1].length;
      
                if (this.__index__ < 0 || shift < this.__index__) {
                  this.__schema__     = '';
                  this.__index__      = shift;
                  this.__last_index__ = ml.index + ml[0].length;
                }
              }
            }
          }
        }
      
        if (this.__opts__.fuzzyEmail && this.__compiled__['mailto:']) {
          // guess schemaless emails
          at_pos = text.indexOf('@');
          if (at_pos >= 0) {
            // We can't skip this check, because this cases are possible:
            // 192.168.1.1@gmail.com, my.in@example.com
            if ((me = text.match(this.re.email_fuzzy)) !== null) {
      
              shift = me.index + me[1].length;
              next  = me.index + me[0].length;
      
              if (this.__index__ < 0 || shift < this.__index__ ||
                  (shift === this.__index__ && next > this.__last_index__)) {
                this.__schema__     = 'mailto:';
                this.__index__      = shift;
                this.__last_index__ = next;
              }
            }
          }
        }
      
        return this.__index__ >= 0;
      };
      
      
      /**
       * LinkifyIt#pretest(text) -> Boolean
       *
       * Very quick check, that can give false positives. Returns true if link MAY BE
       * can exists. Can be used for speed optimization, when you need to check that
       * link NOT exists.
       **/
      LinkifyIt.prototype.pretest = function pretest(text) {
        return this.re.pretest.test(text);
      };
      
      
      /**
       * LinkifyIt#testSchemaAt(text, name, position) -> Number
       * - text (String): text to scan
       * - name (String): rule (schema) name
       * - position (Number): text offset to check from
       *
       * Similar to [[LinkifyIt#test]] but checks only specific protocol tail exactly
       * at given position. Returns length of found pattern (0 on fail).
       **/
      LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text, schema, pos) {
        // If not supported schema check requested - terminate
        if (!this.__compiled__[schema.toLowerCase()]) {
          return 0;
        }
        return this.__compiled__[schema.toLowerCase()].validate(text, pos, this);
      };
      
      
      /**
       * LinkifyIt#match(text) -> Array|null
       *
       * Returns array of found link descriptions or `null` on fail. We strongly
       * recommend to use [[LinkifyIt#test]] first, for best speed.
       *
       * ##### Result match description
       *
       * - __schema__ - link schema, can be empty for fuzzy links, or `//` for
       *   protocol-neutral  links.
       * - __index__ - offset of matched text
       * - __lastIndex__ - index of next char after mathch end
       * - __raw__ - matched text
       * - __text__ - normalized text
       * - __url__ - link, generated from matched text
       **/
      LinkifyIt.prototype.match = function match(text) {
        var shift = 0, result = [];
      
        // Try to take previous element from cache, if .test() called before
        if (this.__index__ >= 0 && this.__text_cache__ === text) {
          result.push(createMatch(this, shift));
          shift = this.__last_index__;
        }
      
        // Cut head if cache was used
        var tail = shift ? text.slice(shift) : text;
      
        // Scan string until end reached
        while (this.test(tail)) {
          result.push(createMatch(this, shift));
      
          tail = tail.slice(this.__last_index__);
          shift += this.__last_index__;
        }
      
        if (result.length) {
          return result;
        }
      
        return null;
      };
      
      
      /** chainable
       * LinkifyIt#tlds(list [, keepOld]) -> this
       * - list (Array): list of tlds
       * - keepOld (Boolean): merge with current list if `true` (`false` by default)
       *
       * Load (or merge) new tlds list. Those are user for fuzzy links (without prefix)
       * to avoid false positives. By default this algorythm used:
       *
       * - hostname with any 2-letter root zones are ok.
       * - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
       *   are ok.
       * - encoded (`xn--...`) root zones are ok.
       *
       * If list is replaced, then exact match for 2-chars root zones will be checked.
       **/
      LinkifyIt.prototype.tlds = function tlds(list, keepOld) {
        list = Array.isArray(list) ? list : [ list ];
      
        if (!keepOld) {
          this.__tlds__ = list.slice();
          this.__tlds_replaced__ = true;
          compile(this);
          return this;
        }
      
        this.__tlds__ = this.__tlds__.concat(list)
                                        .sort()
                                        .filter(function (el, idx, arr) {
                                          return el !== arr[idx - 1];
                                        })
                                        .reverse();
      
        compile(this);
        return this;
      };
      
      /**
       * LinkifyIt#normalize(match)
       *
       * Default normalizer (if schema does not define it's own).
       **/
      LinkifyIt.prototype.normalize = function normalize(match) {
      
        // Do minimal possible changes by default. Need to collect feedback prior
        // to move forward https://github.com/markdown-it/linkify-it/issues/1
      
        if (!match.schema) { match.url = 'http://' + match.url; }
      
        if (match.schema === 'mailto:' && !/^mailto:/i.test(match.url)) {
          match.url = 'mailto:' + match.url;
        }
      };
      
      
      /**
       * LinkifyIt#onCompile()
       *
       * Override to modify basic RegExp-s.
       **/
      LinkifyIt.prototype.onCompile = function onCompile() {
      };
      
      
      module.exports = LinkifyIt;
      
      },{"./lib/re":54}],54:[function(require,module,exports){
      
      
      module.exports = function (opts) {
        var re = {};
      
        // Use direct extract instead of `regenerate` to reduse browserified size
        re.src_Any = require('uc.micro/properties/Any/regex').source;
        re.src_Cc  = require('uc.micro/categories/Cc/regex').source;
        re.src_Z   = require('uc.micro/categories/Z/regex').source;
        re.src_P   = require('uc.micro/categories/P/regex').source;
      
        // \p{\Z\P\Cc\CF} (white spaces + control + format + punctuation)
        re.src_ZPCc = [ re.src_Z, re.src_P, re.src_Cc ].join('|');
      
        // \p{\Z\Cc} (white spaces + control)
        re.src_ZCc = [ re.src_Z, re.src_Cc ].join('|');
      
        // Experimental. List of chars, completely prohibited in links
        // because can separate it from other part of text
        var text_separators = '[><\uff5c]';
      
        // All possible word characters (everything without punctuation, spaces & controls)
        // Defined via punctuation & spaces to save space
        // Should be something like \p{\L\N\S\M} (\w but without `_`)
        re.src_pseudo_letter       = '(?:(?!' + text_separators + '|' + re.src_ZPCc + ')' + re.src_Any + ')';
        // The same as abothe but without [0-9]
        // var src_pseudo_letter_non_d = '(?:(?![0-9]|' + src_ZPCc + ')' + src_Any + ')';
      
        ////////////////////////////////////////////////////////////////////////////////
      
        re.src_ip4 =
      
          '(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
      
        // Prohibit any of "@/[]()" in user/pass to avoid wrong domain fetch.
        re.src_auth    = '(?:(?:(?!' + re.src_ZCc + '|[@/\\[\\]()]).)+@)?';
      
        re.src_port =
      
          '(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?';
      
        re.src_host_terminator =
      
          '(?=$|' + text_separators + '|' + re.src_ZPCc + ')(?!-|_|:\\d|\\.-|\\.(?!$|' + re.src_ZPCc + '))';
      
        re.src_path =
      
          '(?:' +
            '[/?#]' +
              '(?:' +
                '(?!' + re.src_ZCc + '|' + text_separators + '|[()[\\]{}.,"\'?!\\-]).|' +
                '\\[(?:(?!' + re.src_ZCc + '|\\]).)*\\]|' +
                '\\((?:(?!' + re.src_ZCc + '|[)]).)*\\)|' +
                '\\{(?:(?!' + re.src_ZCc + '|[}]).)*\\}|' +
                '\\"(?:(?!' + re.src_ZCc + '|["]).)+\\"|' +
                "\\'(?:(?!" + re.src_ZCc + "|[']).)+\\'|" +
                "\\'(?=" + re.src_pseudo_letter + '|[-]).|' +  // allow `I'm_king` if no pair found
                '\\.{2,4}[a-zA-Z0-9%/]|' + // github has ... in commit range links,
                                           // google has .... in links (issue #66)
                                           // Restrict to
                                           // - english
                                           // - percent-encoded
                                           // - parts of file path
                                           // until more examples found.
                '\\.(?!' + re.src_ZCc + '|[.]).|' +
                (opts && opts['---'] ?
                  '\\-(?!--(?:[^-]|$))(?:-*)|' // `---` => long dash, terminate
                  :
                  '\\-+|'
                ) +
                '\\,(?!' + re.src_ZCc + ').|' +      // allow `,,,` in paths
                '\\!(?!' + re.src_ZCc + '|[!]).|' +
                '\\?(?!' + re.src_ZCc + '|[?]).' +
              ')+' +
            '|\\/' +
          ')?';
      
        // Allow anything in markdown spec, forbid quote (") at the first position
        // because emails enclosed in quotes are far more common
        re.src_email_name =
      
          '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]*';
      
        re.src_xn =
      
          'xn--[a-z0-9\\-]{1,59}';
      
        // More to read about domain names
        // http://serverfault.com/questions/638260/
      
        re.src_domain_root =
      
          // Allow letters & digits (http://test1)
          '(?:' +
            re.src_xn +
            '|' +
            re.src_pseudo_letter + '{1,63}' +
          ')';
      
        re.src_domain =
      
          '(?:' +
            re.src_xn +
            '|' +
            '(?:' + re.src_pseudo_letter + ')' +
            '|' +
            '(?:' + re.src_pseudo_letter + '(?:-|' + re.src_pseudo_letter + '){0,61}' + re.src_pseudo_letter + ')' +
          ')';
      
        re.src_host =
      
          '(?:' +
          // Don't need IP check, because digits are already allowed in normal domain names
          //   src_ip4 +
          // '|' +
            '(?:(?:(?:' + re.src_domain + ')\\.)*' + re.src_domain/*_root*/ + ')' +
          ')';
      
        re.tpl_host_fuzzy =
      
          '(?:' +
            re.src_ip4 +
          '|' +
            '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))' +
          ')';
      
        re.tpl_host_no_ip_fuzzy =
      
          '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))';
      
        re.src_host_strict =
      
          re.src_host + re.src_host_terminator;
      
        re.tpl_host_fuzzy_strict =
      
          re.tpl_host_fuzzy + re.src_host_terminator;
      
        re.src_host_port_strict =
      
          re.src_host + re.src_port + re.src_host_terminator;
      
        re.tpl_host_port_fuzzy_strict =
      
          re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;
      
        re.tpl_host_port_no_ip_fuzzy_strict =
      
          re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;
      
      
        ////////////////////////////////////////////////////////////////////////////////
        // Main rules
      
        // Rude test fuzzy links by host, for quick deny
        re.tpl_host_fuzzy_test =
      
          'localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:' + re.src_ZPCc + '|>|$))';
      
        re.tpl_email_fuzzy =
      
            '(^|' + text_separators + '|"|\\(|' + re.src_ZCc + ')' +
            '(' + re.src_email_name + '@' + re.tpl_host_fuzzy_strict + ')';
      
        re.tpl_link_fuzzy =
            // Fuzzy link can't be prepended with .:/\- and non punctuation.
            // but can start with > (markdown blockquote)
            '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
            '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_fuzzy_strict + re.src_path + ')';
      
        re.tpl_link_no_ip_fuzzy =
            // Fuzzy link can't be prepended with .:/\- and non punctuation.
            // but can start with > (markdown blockquote)
            '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
            '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_no_ip_fuzzy_strict + re.src_path + ')';
      
        return re;
      };
      
      },{"uc.micro/categories/Cc/regex":61,"uc.micro/categories/P/regex":63,"uc.micro/categories/Z/regex":64,"uc.micro/properties/Any/regex":66}],55:[function(require,module,exports){
      
      
      /* eslint-disable no-bitwise */
      
      var decodeCache = {};
      
      function getDecodeCache(exclude) {
        var i, ch, cache = decodeCache[exclude];
        if (cache) { return cache; }
      
        cache = decodeCache[exclude] = [];
      
        for (i = 0; i < 128; i++) {
          ch = String.fromCharCode(i);
          cache.push(ch);
        }
      
        for (i = 0; i < exclude.length; i++) {
          ch = exclude.charCodeAt(i);
          cache[ch] = '%' + ('0' + ch.toString(16).toUpperCase()).slice(-2);
        }
      
        return cache;
      }
      
      
      // Decode percent-encoded string.
      //
      function decode(string, exclude) {
        var cache;
      
        if (typeof exclude !== 'string') {
          exclude = decode.defaultChars;
        }
      
        cache = getDecodeCache(exclude);
      
        return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
          var i, l, b1, b2, b3, b4, chr,
              result = '';
      
          for (i = 0, l = seq.length; i < l; i += 3) {
            b1 = parseInt(seq.slice(i + 1, i + 3), 16);
      
            if (b1 < 0x80) {
              result += cache[b1];
              continue;
            }
      
            if ((b1 & 0xE0) === 0xC0 && (i + 3 < l)) {
              // 110xxxxx 10xxxxxx
              b2 = parseInt(seq.slice(i + 4, i + 6), 16);
      
              if ((b2 & 0xC0) === 0x80) {
                chr = ((b1 << 6) & 0x7C0) | (b2 & 0x3F);
      
                if (chr < 0x80) {
                  result += '\ufffd\ufffd';
                } else {
                  result += String.fromCharCode(chr);
                }
      
                i += 3;
                continue;
              }
            }
      
            if ((b1 & 0xF0) === 0xE0 && (i + 6 < l)) {
              // 1110xxxx 10xxxxxx 10xxxxxx
              b2 = parseInt(seq.slice(i + 4, i + 6), 16);
              b3 = parseInt(seq.slice(i + 7, i + 9), 16);
      
              if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                chr = ((b1 << 12) & 0xF000) | ((b2 << 6) & 0xFC0) | (b3 & 0x3F);
      
                if (chr < 0x800 || (chr >= 0xD800 && chr <= 0xDFFF)) {
                  result += '\ufffd\ufffd\ufffd';
                } else {
                  result += String.fromCharCode(chr);
                }
      
                i += 6;
                continue;
              }
            }
      
            if ((b1 & 0xF8) === 0xF0 && (i + 9 < l)) {
              // 111110xx 10xxxxxx 10xxxxxx 10xxxxxx
              b2 = parseInt(seq.slice(i + 4, i + 6), 16);
              b3 = parseInt(seq.slice(i + 7, i + 9), 16);
              b4 = parseInt(seq.slice(i + 10, i + 12), 16);
      
              if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80 && (b4 & 0xC0) === 0x80) {
                chr = ((b1 << 18) & 0x1C0000) | ((b2 << 12) & 0x3F000) | ((b3 << 6) & 0xFC0) | (b4 & 0x3F);
      
                if (chr < 0x10000 || chr > 0x10FFFF) {
                  result += '\ufffd\ufffd\ufffd\ufffd';
                } else {
                  chr -= 0x10000;
                  result += String.fromCharCode(0xD800 + (chr >> 10), 0xDC00 + (chr & 0x3FF));
                }
      
                i += 9;
                continue;
              }
            }
      
            result += '\ufffd';
          }
      
          return result;
        });
      }
      
      
      decode.defaultChars   = ';/?:@&=+$,#';
      decode.componentChars = '';
      
      
      module.exports = decode;
      
      },{}],56:[function(require,module,exports){
      
      
      var encodeCache = {};
      
      
      // Create a lookup array where anything but characters in `chars` string
      // and alphanumeric chars is percent-encoded.
      //
      function getEncodeCache(exclude) {
        var i, ch, cache = encodeCache[exclude];
        if (cache) { return cache; }
      
        cache = encodeCache[exclude] = [];
      
        for (i = 0; i < 128; i++) {
          ch = String.fromCharCode(i);
      
          if (/^[0-9a-z]$/i.test(ch)) {
            // always allow unencoded alphanumeric characters
            cache.push(ch);
          } else {
            cache.push('%' + ('0' + i.toString(16).toUpperCase()).slice(-2));
          }
        }
      
        for (i = 0; i < exclude.length; i++) {
          cache[exclude.charCodeAt(i)] = exclude[i];
        }
      
        return cache;
      }
      
      
      // Encode unsafe characters with percent-encoding, skipping already
      // encoded sequences.
      //
      //  - string       - string to encode
      //  - exclude      - list of characters to ignore (in addition to a-zA-Z0-9)
      //  - keepEscaped  - don't encode '%' in a correct escape sequence (default: true)
      //
      function encode(string, exclude, keepEscaped) {
        var i, l, code, nextCode, cache,
            result = '';
      
        if (typeof exclude !== 'string') {
          // encode(string, keepEscaped)
          keepEscaped  = exclude;
          exclude = encode.defaultChars;
        }
      
        if (typeof keepEscaped === 'undefined') {
          keepEscaped = true;
        }
      
        cache = getEncodeCache(exclude);
      
        for (i = 0, l = string.length; i < l; i++) {
          code = string.charCodeAt(i);
      
          if (keepEscaped && code === 0x25 /* % */ && i + 2 < l) {
            if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
              result += string.slice(i, i + 3);
              i += 2;
              continue;
            }
          }
      
          if (code < 128) {
            result += cache[code];
            continue;
          }
      
          if (code >= 0xD800 && code <= 0xDFFF) {
            if (code >= 0xD800 && code <= 0xDBFF && i + 1 < l) {
              nextCode = string.charCodeAt(i + 1);
              if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
                result += encodeURIComponent(string[i] + string[i + 1]);
                i++;
                continue;
              }
            }
            result += '%EF%BF%BD';
            continue;
          }
      
          result += encodeURIComponent(string[i]);
        }
      
        return result;
      }
      
      encode.defaultChars   = ";/?:@&=+$,-_.!~*'()#";
      encode.componentChars = "-_.!~*'()";
      
      
      module.exports = encode;
      
      },{}],57:[function(require,module,exports){
      
      
      module.exports = function format(url) {
        var result = '';
      
        result += url.protocol || '';
        result += url.slashes ? '//' : '';
        result += url.auth ? url.auth + '@' : '';
      
        if (url.hostname && url.hostname.indexOf(':') !== -1) {
          // ipv6 address
          result += '[' + url.hostname + ']';
        } else {
          result += url.hostname || '';
        }
      
        result += url.port ? ':' + url.port : '';
        result += url.pathname || '';
        result += url.search || '';
        result += url.hash || '';
      
        return result;
      };
      
      },{}],58:[function(require,module,exports){
      
      
      module.exports.encode = require('./encode');
      module.exports.decode = require('./decode');
      module.exports.format = require('./format');
      module.exports.parse  = require('./parse');
      
      },{"./decode":55,"./encode":56,"./format":57,"./parse":59}],59:[function(require,module,exports){
      
      //
      // Changes from joyent/node:
      //
      // 1. No leading slash in paths,
      //    e.g. in `url.parse('http://foo?bar')` pathname is ``, not `/`
      //
      // 2. Backslashes are not replaced with slashes,
      //    so `http:\\example.org\` is treated like a relative path
      //
      // 3. Trailing colon is treated like a part of the path,
      //    i.e. in `http://example.org:foo` pathname is `:foo`
      //
      // 4. Nothing is URL-encoded in the resulting object,
      //    (in joyent/node some chars in auth and paths are encoded)
      //
      // 5. `url.parse()` does not have `parseQueryString` argument
      //
      // 6. Removed extraneous result properties: `host`, `path`, `query`, etc.,
      //    which can be constructed using other parts of the url.
      //
      
      
      function Url() {
        this.protocol = null;
        this.slashes = null;
        this.auth = null;
        this.port = null;
        this.hostname = null;
        this.hash = null;
        this.search = null;
        this.pathname = null;
      }
      
      // Reference: RFC 3986, RFC 1808, RFC 2396
      
      // define these here so at least they only have to be
      // compiled once on the first module load.
      var protocolPattern = /^([a-z0-9.+-]+:)/i,
          portPattern = /:[0-9]*$/,
      
          // Special case for a simple path URL
          simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,
      
          // RFC 2396: characters reserved for delimiting URLs.
          // We actually just auto-escape these.
          delims = [ '<', '>', '"', '`', ' ', '\r', '\n', '\t' ],
      
          // RFC 2396: characters not allowed for various reasons.
          unwise = [ '{', '}', '|', '\\', '^', '`' ].concat(delims),
      
          // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
          autoEscape = [ '\'' ].concat(unwise),
          // Characters that are never ever allowed in a hostname.
          // Note that any invalid chars are also handled, but these
          // are the ones that are *expected* to be seen, so we fast-path
          // them.
          nonHostChars = [ '%', '/', '?', ';', '#' ].concat(autoEscape),
          hostEndingChars = [ '/', '?', '#' ],
          hostnameMaxLen = 255,
          hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
          hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
          // protocols that can allow "unsafe" and "unwise" chars.
          /* eslint-disable no-script-url */
          // protocols that never have a hostname.
          hostlessProtocol = {
            'javascript': true,
            'javascript:': true
          },
          // protocols that always contain a // bit.
          slashedProtocol = {
            'http': true,
            'https': true,
            'ftp': true,
            'gopher': true,
            'file': true,
            'http:': true,
            'https:': true,
            'ftp:': true,
            'gopher:': true,
            'file:': true
          };
          /* eslint-enable no-script-url */
      
      function urlParse(url, slashesDenoteHost) {
        if (url && url instanceof Url) { return url; }
      
        var u = new Url();
        u.parse(url, slashesDenoteHost);
        return u;
      }
      
      Url.prototype.parse = function(url, slashesDenoteHost) {
        var i, l, lowerProto, hec, slashes,
            rest = url;
      
        // trim before proceeding.
        // This is to support parse stuff like "  http://foo.com  \n"
        rest = rest.trim();
      
        if (!slashesDenoteHost && url.split('#').length === 1) {
          // Try fast path regexp
          var simplePath = simplePathPattern.exec(rest);
          if (simplePath) {
            this.pathname = simplePath[1];
            if (simplePath[2]) {
              this.search = simplePath[2];
            }
            return this;
          }
        }
      
        var proto = protocolPattern.exec(rest);
        if (proto) {
          proto = proto[0];
          lowerProto = proto.toLowerCase();
          this.protocol = proto;
          rest = rest.substr(proto.length);
        }
      
        // figure out if it's got a host
        // user@server is *always* interpreted as a hostname, and url
        // resolution will treat //foo/bar as host=foo,path=bar because that's
        // how the browser resolves relative URLs.
        if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
          slashes = rest.substr(0, 2) === '//';
          if (slashes && !(proto && hostlessProtocol[proto])) {
            rest = rest.substr(2);
            this.slashes = true;
          }
        }
      
        if (!hostlessProtocol[proto] &&
            (slashes || (proto && !slashedProtocol[proto]))) {
      
          // there's a hostname.
          // the first instance of /, ?, ;, or # ends the host.
          //
          // If there is an @ in the hostname, then non-host chars *are* allowed
          // to the left of the last @ sign, unless some host-ending character
          // comes *before* the @-sign.
          // URLs are obnoxious.
          //
          // ex:
          // http://a@b@c/ => user:a@b host:c
          // http://a@b?@c => user:a host:c path:/?@c
      
          // v0.12 TODO(isaacs): This is not quite how Chrome does things.
          // Review our test case against browsers more comprehensively.
      
          // find the first instance of any hostEndingChars
          var hostEnd = -1;
          for (i = 0; i < hostEndingChars.length; i++) {
            hec = rest.indexOf(hostEndingChars[i]);
            if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
              hostEnd = hec;
            }
          }
      
          // at this point, either we have an explicit point where the
          // auth portion cannot go past, or the last @ char is the decider.
          var auth, atSign;
          if (hostEnd === -1) {
            // atSign can be anywhere.
            atSign = rest.lastIndexOf('@');
          } else {
            // atSign must be in auth portion.
            // http://a@b/c@d => host:b auth:a path:/c@d
            atSign = rest.lastIndexOf('@', hostEnd);
          }
      
          // Now we have a portion which is definitely the auth.
          // Pull that off.
          if (atSign !== -1) {
            auth = rest.slice(0, atSign);
            rest = rest.slice(atSign + 1);
            this.auth = auth;
          }
      
          // the host is the remaining to the left of the first non-host char
          hostEnd = -1;
          for (i = 0; i < nonHostChars.length; i++) {
            hec = rest.indexOf(nonHostChars[i]);
            if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
              hostEnd = hec;
            }
          }
          // if we still have not hit it, then the entire thing is a host.
          if (hostEnd === -1) {
            hostEnd = rest.length;
          }
      
          if (rest[hostEnd - 1] === ':') { hostEnd--; }
          var host = rest.slice(0, hostEnd);
          rest = rest.slice(hostEnd);
      
          // pull out port.
          this.parseHost(host);
      
          // we've indicated that there is a hostname,
          // so even if it's empty, it has to be present.
          this.hostname = this.hostname || '';
      
          // if hostname begins with [ and ends with ]
          // assume that it's an IPv6 address.
          var ipv6Hostname = this.hostname[0] === '[' &&
              this.hostname[this.hostname.length - 1] === ']';
      
          // validate a little.
          if (!ipv6Hostname) {
            var hostparts = this.hostname.split(/\./);
            for (i = 0, l = hostparts.length; i < l; i++) {
              var part = hostparts[i];
              if (!part) { continue; }
              if (!part.match(hostnamePartPattern)) {
                var newpart = '';
                for (var j = 0, k = part.length; j < k; j++) {
                  if (part.charCodeAt(j) > 127) {
                    // we replace non-ASCII char with a temporary placeholder
                    // we need this to make sure size of hostname is not
                    // broken by replacing non-ASCII by nothing
                    newpart += 'x';
                  } else {
                    newpart += part[j];
                  }
                }
                // we test again with ASCII char only
                if (!newpart.match(hostnamePartPattern)) {
                  var validParts = hostparts.slice(0, i);
                  var notHost = hostparts.slice(i + 1);
                  var bit = part.match(hostnamePartStart);
                  if (bit) {
                    validParts.push(bit[1]);
                    notHost.unshift(bit[2]);
                  }
                  if (notHost.length) {
                    rest = notHost.join('.') + rest;
                  }
                  this.hostname = validParts.join('.');
                  break;
                }
              }
            }
          }
      
          if (this.hostname.length > hostnameMaxLen) {
            this.hostname = '';
          }
      
          // strip [ and ] from the hostname
          // the host field still retains them, though
          if (ipv6Hostname) {
            this.hostname = this.hostname.substr(1, this.hostname.length - 2);
          }
        }
      
        // chop off from the tail first.
        var hash = rest.indexOf('#');
        if (hash !== -1) {
          // got a fragment string.
          this.hash = rest.substr(hash);
          rest = rest.slice(0, hash);
        }
        var qm = rest.indexOf('?');
        if (qm !== -1) {
          this.search = rest.substr(qm);
          rest = rest.slice(0, qm);
        }
        if (rest) { this.pathname = rest; }
        if (slashedProtocol[lowerProto] &&
            this.hostname && !this.pathname) {
          this.pathname = '';
        }
      
        return this;
      };
      
      Url.prototype.parseHost = function(host) {
        var port = portPattern.exec(host);
        if (port) {
          port = port[0];
          if (port !== ':') {
            this.port = port.substr(1);
          }
          host = host.substr(0, host.length - port.length);
        }
        if (host) { this.hostname = host; }
      };
      
      module.exports = urlParse;
      
      },{}],60:[function(require,module,exports){
      (function (global){
    (function(root) {
      
        /** Detect free variables */
        var freeExports = typeof exports == 'object' && exports &&
          !exports.nodeType && exports;
        var freeModule = typeof module == 'object' && module &&
          !module.nodeType && module;
        var freeGlobal = typeof global == 'object' && global;
        if (
          freeGlobal.global === freeGlobal ||
          freeGlobal.window === freeGlobal ||
          freeGlobal.self === freeGlobal
        ) {
          root = freeGlobal;
        }
      
        /**
         * The `punycode` object.
         * @name punycode
         * @type Object
         */
        var punycode,
      
        /** Highest positive signed 32-bit float value */
        maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1
      
        /** Bootstring parameters */
        base = 36,
        tMin = 1,
        tMax = 26,
        skew = 38,
        damp = 700,
        initialBias = 72,
        initialN = 128, // 0x80
        delimiter = '-', // '\x2D'
      
        /** Regular expressions */
        regexPunycode = /^xn--/,
        regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
        regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators
      
        /** Error messages */
        errors = {
          'overflow': 'Overflow: input needs wider integers to process',
          'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
          'invalid-input': 'Invalid input'
        },
      
        /** Convenience shortcuts */
        baseMinusTMin = base - tMin,
        floor = Math.floor,
        stringFromCharCode = String.fromCharCode,
      
        /** Temporary variable */
        key;
      
        /*--------------------------------------------------------------------------*/
      
        /**
         * A generic error utility function.
         * @private
         * @param {String} type The error type.
         * @returns {Error} Throws a `RangeError` with the applicable error message.
         */
        function error(type) {
          throw new RangeError(errors[type]);
        }
      
        /**
         * A generic `Array#map` utility function.
         * @private
         * @param {Array} array The array to iterate over.
         * @param {Function} callback The function that gets called for every array
         * item.
         * @returns {Array} A new array of values returned by the callback function.
         */
        function map(array, fn) {
          var length = array.length;
          var result = [];
          while (length--) {
            result[length] = fn(array[length]);
          }
          return result;
        }
      
        /**
         * A simple `Array#map`-like wrapper to work with domain name strings or email
         * addresses.
         * @private
         * @param {String} domain The domain name or email address.
         * @param {Function} callback The function that gets called for every
         * character.
         * @returns {Array} A new string of characters returned by the callback
         * function.
         */
        function mapDomain(string, fn) {
          var parts = string.split('@');
          var result = '';
          if (parts.length > 1) {
            // In email addresses, only the domain name should be punycoded. Leave
            // the local part (i.e. everything up to `@`) intact.
            result = parts[0] + '@';
            string = parts[1];
          }
          // Avoid `split(regex)` for IE8 compatibility. See #17.
          string = string.replace(regexSeparators, '\x2E');
          var labels = string.split('.');
          var encoded = map(labels, fn).join('.');
          return result + encoded;
        }
      
        /**
         * Creates an array containing the numeric code points of each Unicode
         * character in the string. While JavaScript uses UCS-2 internally,
         * this function will convert a pair of surrogate halves (each of which
         * UCS-2 exposes as separate characters) into a single code point,
         * matching UTF-16.
         * @see `punycode.ucs2.encode`
         * @see <https://mathiasbynens.be/notes/javascript-encoding>
         * @memberOf punycode.ucs2
         * @name decode
         * @param {String} string The Unicode input string (UCS-2).
         * @returns {Array} The new array of code points.
         */
        function ucs2decode(string) {
          var output = [],
              counter = 0,
              length = string.length,
              value,
              extra;
          while (counter < length) {
            value = string.charCodeAt(counter++);
            if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
              // high surrogate, and there is a next character
              extra = string.charCodeAt(counter++);
              if ((extra & 0xFC00) == 0xDC00) { // low surrogate
                output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
              } else {
                // unmatched surrogate; only append this code unit, in case the next
                // code unit is the high surrogate of a surrogate pair
                output.push(value);
                counter--;
              }
            } else {
              output.push(value);
            }
          }
          return output;
        }
      
        /**
         * Creates a string based on an array of numeric code points.
         * @see `punycode.ucs2.decode`
         * @memberOf punycode.ucs2
         * @name encode
         * @param {Array} codePoints The array of numeric code points.
         * @returns {String} The new Unicode string (UCS-2).
         */
        function ucs2encode(array) {
          return map(array, function(value) {
            var output = '';
            if (value > 0xFFFF) {
              value -= 0x10000;
              output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
              value = 0xDC00 | value & 0x3FF;
            }
            output += stringFromCharCode(value);
            return output;
          }).join('');
        }
      
        /**
         * Converts a basic code point into a digit/integer.
         * @see `digitToBasic()`
         * @private
         * @param {Number} codePoint The basic numeric code point value.
         * @returns {Number} The numeric value of a basic code point (for use in
         * representing integers) in the range `0` to `base - 1`, or `base` if
         * the code point does not represent a value.
         */
        function basicToDigit(codePoint) {
          if (codePoint - 48 < 10) {
            return codePoint - 22;
          }
          if (codePoint - 65 < 26) {
            return codePoint - 65;
          }
          if (codePoint - 97 < 26) {
            return codePoint - 97;
          }
          return base;
        }
      
        /**
         * Converts a digit/integer into a basic code point.
         * @see `basicToDigit()`
         * @private
         * @param {Number} digit The numeric value of a basic code point.
         * @returns {Number} The basic code point whose value (when used for
         * representing integers) is `digit`, which needs to be in the range
         * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
         * used; else, the lowercase form is used. The behavior is undefined
         * if `flag` is non-zero and `digit` has no uppercase form.
         */
        function digitToBasic(digit, flag) {
          //  0..25 map to ASCII a..z or A..Z
          // 26..35 map to ASCII 0..9
          return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
        }
      
        /**
         * Bias adaptation function as per section 3.4 of RFC 3492.
         * https://tools.ietf.org/html/rfc3492#section-3.4
         * @private
         */
        function adapt(delta, numPoints, firstTime) {
          var k = 0;
          delta = firstTime ? floor(delta / damp) : delta >> 1;
          delta += floor(delta / numPoints);
          for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
            delta = floor(delta / baseMinusTMin);
          }
          return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
        }
      
        /**
         * Converts a Punycode string of ASCII-only symbols to a string of Unicode
         * symbols.
         * @memberOf punycode
         * @param {String} input The Punycode string of ASCII-only symbols.
         * @returns {String} The resulting string of Unicode symbols.
         */
        function decode(input) {
          // Don't use UCS-2
          var output = [],
              inputLength = input.length,
              out,
              i = 0,
              n = initialN,
              bias = initialBias,
              basic,
              j,
              index,
              oldi,
              w,
              k,
              digit,
              t,
              /** Cached calculation results */
              baseMinusT;
      
          // Handle the basic code points: let `basic` be the number of input code
          // points before the last delimiter, or `0` if there is none, then copy
          // the first basic code points to the output.
      
          basic = input.lastIndexOf(delimiter);
          if (basic < 0) {
            basic = 0;
          }
      
          for (j = 0; j < basic; ++j) {
            // if it's not a basic code point
            if (input.charCodeAt(j) >= 0x80) {
              error('not-basic');
            }
            output.push(input.charCodeAt(j));
          }
      
          // Main decoding loop: start just after the last delimiter if any basic code
          // points were copied; start at the beginning otherwise.
      
          for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {
      
            // `index` is the index of the next character to be consumed.
            // Decode a generalized variable-length integer into `delta`,
            // which gets added to `i`. The overflow checking is easier
            // if we increase `i` as we go, then subtract off its starting
            // value at the end to obtain `delta`.
            for (oldi = i, w = 1, k = base; /* no condition */; k += base) {
      
              if (index >= inputLength) {
                error('invalid-input');
              }
      
              digit = basicToDigit(input.charCodeAt(index++));
      
              if (digit >= base || digit > floor((maxInt - i) / w)) {
                error('overflow');
              }
      
              i += digit * w;
              t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
      
              if (digit < t) {
                break;
              }
      
              baseMinusT = base - t;
              if (w > floor(maxInt / baseMinusT)) {
                error('overflow');
              }
      
              w *= baseMinusT;
      
            }
      
            out = output.length + 1;
            bias = adapt(i - oldi, out, oldi == 0);
      
            // `i` was supposed to wrap around from `out` to `0`,
            // incrementing `n` each time, so we'll fix that now:
            if (floor(i / out) > maxInt - n) {
              error('overflow');
            }
      
            n += floor(i / out);
            i %= out;
      
            // Insert `n` at position `i` of the output
            output.splice(i++, 0, n);
      
          }
      
          return ucs2encode(output);
        }
      
        /**
         * Converts a string of Unicode symbols (e.g. a domain name label) to a
         * Punycode string of ASCII-only symbols.
         * @memberOf punycode
         * @param {String} input The string of Unicode symbols.
         * @returns {String} The resulting Punycode string of ASCII-only symbols.
         */
        function encode(input) {
          var n,
              delta,
              handledCPCount,
              basicLength,
              bias,
              j,
              m,
              q,
              k,
              t,
              currentValue,
              output = [],
              /** `inputLength` will hold the number of code points in `input`. */
              inputLength,
              /** Cached calculation results */
              handledCPCountPlusOne,
              baseMinusT,
              qMinusT;
      
          // Convert the input in UCS-2 to Unicode
          input = ucs2decode(input);
      
          // Cache the length
          inputLength = input.length;
      
          // Initialize the state
          n = initialN;
          delta = 0;
          bias = initialBias;
      
          // Handle the basic code points
          for (j = 0; j < inputLength; ++j) {
            currentValue = input[j];
            if (currentValue < 0x80) {
              output.push(stringFromCharCode(currentValue));
            }
          }
      
          handledCPCount = basicLength = output.length;
      
          // `handledCPCount` is the number of code points that have been handled;
          // `basicLength` is the number of basic code points.
      
          // Finish the basic string - if it is not empty - with a delimiter
          if (basicLength) {
            output.push(delimiter);
          }
      
          // Main encoding loop:
          while (handledCPCount < inputLength) {
      
            // All non-basic code points < n have been handled already. Find the next
            // larger one:
            for (m = maxInt, j = 0; j < inputLength; ++j) {
              currentValue = input[j];
              if (currentValue >= n && currentValue < m) {
                m = currentValue;
              }
            }
      
            // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
            // but guard against overflow
            handledCPCountPlusOne = handledCPCount + 1;
            if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
              error('overflow');
            }
      
            delta += (m - n) * handledCPCountPlusOne;
            n = m;
      
            for (j = 0; j < inputLength; ++j) {
              currentValue = input[j];
      
              if (currentValue < n && ++delta > maxInt) {
                error('overflow');
              }
      
              if (currentValue == n) {
                // Represent delta as a generalized variable-length integer
                for (q = delta, k = base; /* no condition */; k += base) {
                  t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
                  if (q < t) {
                    break;
                  }
                  qMinusT = q - t;
                  baseMinusT = base - t;
                  output.push(
                    stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
                  );
                  q = floor(qMinusT / baseMinusT);
                }
      
                output.push(stringFromCharCode(digitToBasic(q, 0)));
                bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
                delta = 0;
                ++handledCPCount;
              }
            }
      
            ++delta;
            ++n;
      
          }
          return output.join('');
        }
      
        /**
         * Converts a Punycode string representing a domain name or an email address
         * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
         * it doesn't matter if you call it on a string that has already been
         * converted to Unicode.
         * @memberOf punycode
         * @param {String} input The Punycoded domain name or email address to
         * convert to Unicode.
         * @returns {String} The Unicode representation of the given Punycode
         * string.
         */
        function toUnicode(input) {
          return mapDomain(input, function(string) {
            return regexPunycode.test(string)
              ? decode(string.slice(4).toLowerCase())
              : string;
          });
        }
      
        /**
         * Converts a Unicode string representing a domain name or an email address to
         * Punycode. Only the non-ASCII parts of the domain name will be converted,
         * i.e. it doesn't matter if you call it with a domain that's already in
         * ASCII.
         * @memberOf punycode
         * @param {String} input The domain name or email address to convert, as a
         * Unicode string.
         * @returns {String} The Punycode representation of the given domain name or
         * email address.
         */
        function toASCII(input) {
          return mapDomain(input, function(string) {
            return regexNonASCII.test(string)
              ? 'xn--' + encode(string)
              : string;
          });
        }
      
        /*--------------------------------------------------------------------------*/
      
        /** Define the public API */
        punycode = {
          /**
           * A string representing the current Punycode.js version number.
           * @memberOf punycode
           * @type String
           */
          'version': '1.4.1',
          /**
           * An object of methods to convert from JavaScript's internal character
           * representation (UCS-2) to Unicode code points, and back.
           * @see <https://mathiasbynens.be/notes/javascript-encoding>
           * @memberOf punycode
           * @type Object
           */
          'ucs2': {
            'decode': ucs2decode,
            'encode': ucs2encode
          },
          'decode': decode,
          'encode': encode,
          'toASCII': toASCII,
          'toUnicode': toUnicode
        };
      
        /** Expose `punycode` */
        // Some AMD build optimizers, like r.js, check for specific condition patterns
        // like the following:
        if (freeExports && freeModule) {
          if (module.exports == freeExports) {
            // in Node.js, io.js, or RingoJS v0.8.0+
            freeModule.exports = punycode;
          } else {
            // in Narwhal or RingoJS v0.7.0-
            for (key in punycode) {
              punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
            }
          }
        } else {
          // in Rhino or a web browser
          root.punycode = punycode;
        }
      
      }(this));
      
      }).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
      },{}],61:[function(require,module,exports){
      module.exports=/[\0-\x1F\x7F-\x9F]/;
      },{}],62:[function(require,module,exports){
      module.exports=/[\xAD\u0600-\u0605\u061C\u06DD\u070F\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;
      },{}],63:[function(require,module,exports){
      module.exports=/[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4E\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDF55-\uDF59]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDF3C-\uDF3E]|\uD806[\uDC3B\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8]|\uD809[\uDC70-\uDC74]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;
      },{}],64:[function(require,module,exports){
      module.exports=/[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
      },{}],65:[function(require,module,exports){
      
      exports.Any = require('./properties/Any/regex');
      exports.Cc  = require('./categories/Cc/regex');
      exports.Cf  = require('./categories/Cf/regex');
      exports.P   = require('./categories/P/regex');
      exports.Z   = require('./categories/Z/regex');
      
      },{"./categories/Cc/regex":61,"./categories/Cf/regex":62,"./categories/P/regex":63,"./categories/Z/regex":64,"./properties/Any/regex":66}],66:[function(require,module,exports){
      module.exports=/[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
      },{}],67:[function(require,module,exports){
      
      
      module.exports = require('./lib/');
      
      },{"./lib/":9}]},{},[67])(67)
      });
      const markdownit = define();

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * For AttributeParts, sets the attribute if the value is defined and removes
     * the attribute if the value is undefined.
     *
     * For other part types, this directive is a no-op.
     */
    const ifDefined = directive((value) => (part) => {
        if (value === undefined && part instanceof AttributePart) {
            if (value !== part.value) {
                const name = part.committer.name;
                part.committer.element.removeAttribute(name);
            }
        }
        else {
            part.setValue(value);
        }
    });

    const cssStr$9 = css`
.dropdown {
  position: relative;
}

.dropdown.open .toggleable:not(.primary) {
  background: #dadada;
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.1);
  border-color: transparent;
  outline: 0;
}

.toggleable-container .dropdown-items {
  display: none;
}

.toggleable-container.hover:hover .dropdown-items,
.toggleable-container.open .dropdown-items {
  display: block;
}

.dropdown-items {
  width: 270px;
  position: absolute;
  right: 0px;
  z-index: 3000;
  background: #fff;
  border: 1px solid #dadada;
  border-radius: 10px;
  box-shadow: 0 2px 15px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dropdown-items .section {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 5px 0;
}

.dropdown-items .section-header {
  padding: 2px 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-items .section-header.light {
  color: var(--color-text--light);
  font-weight: 500;
}

.dropdown-items .section-header.small {
  font-size: 12px;
}

.dropdown-items hr {
  border: 0;
  border-bottom: 1px solid #ddd;
}

.dropdown-items.thin {
  width: 170px;
}

.dropdown-items.wide {
  width: 400px;
}

.dropdown-items.compact .dropdown-item {
  padding: 2px 15px;
  border-bottom: 0;
}

.dropdown-items.compact .description {
  margin-left: 0;
}

.dropdown-items.compact hr {
  margin: 5px 0;
}

.dropdown-items.roomy .dropdown-item {
  padding: 10px 15px;
}

.dropdown-items.very-roomy .dropdown-item {
  padding: 20px 30px;
}

.dropdown-items.no-border .dropdown-item {
  border-bottom: 0;
}

.dropdown-items.center {
  left: 50%;
  transform: translateX(-50%);
}

.dropdown-items.left {
  right: initial;
  left: 0;
}

.dropdown-items.over {
  top: 0;
}

.dropdown-items.top {
  bottom: calc(100% + 5px);
}

.dropdown-items.with-triangle:before {
  content: '';
  position: absolute;
  top: -8px;
  right: 10px;
  width: 12px;
  height: 12px;
  z-index: 3;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 8px solid #fff;
}

.dropdown-items.with-triangle.left:before {
  left: 10px;
}

.dropdown-items.with-triangle.center:before {
  left: 43%;
}

.dropdown-title {
  border-bottom: 1px solid #eee;
  padding: 2px 8px;
  font-size: 11px;
  color: gray;
}

.dropdown-item {
  display: block;
  padding: 7px 15px;
  border-bottom: 1px solid #eee;
}

.dropdown-item.disabled {
  opacity: 0.25;
}

.dropdown-item .fa-check-square {
  color: var(--color-blue);
}

.dropdown-item .fa-check-square,
.dropdown-item .fa-square-o {
  font-size: 14px;
}

.dropdown-item .fa-check {
  font-size: 11.5px;
}

.dropdown-item.no-border {
  border-bottom: 0;
}

.dropdown-item:hover:not(.no-hover) {
  background: #eee;
  cursor: pointer;
}

.dropdown-item:hover:not(.no-hover) i:not(.fa-check-square) {
  color: var(--color-text);
}

.dropdown-item:hover:not(.no-hover) .description {
  color: var(--color-text);
}

.dropdown-item:hover:not(.no-hover).disabled {
  background: inherit;
  cursor: default;
}

.dropdown-item .fa,
.dropdown-item i {
  display: inline-block;
  width: 20px;
  color: rgba(0, 0, 0, 0.65);
}

.dropdown-item .fa-fw {
  margin-left: -3px;
  margin-right: 3px;
}

.dropdown-item img {
  display: inline-block;
  width: 16px;
  position: relative;
  top: 3px;
  margin-right: 6px;
}

.dropdown-item .btn .fa {
  color: inherit;
}

.dropdown-item .label {
  font-weight: 500;
  margin-bottom: 3px;
}

.dropdown-item .description {
  color: var(--color-text--muted);
  margin: 0;
  margin-left: 23px;
  margin-bottom: 3px;
  line-height: 1.5;
}

.dropdown-item .description.small {
  font-size: 12.5px;
}

.dropdown-item:first-of-type {
  border-radius: 2px 2px 0 0;
}

.dropdown-item:last-of-type {
  border-radius: 0 0 2px 2px;
}
`;

    // globals
    // =

    var resolve;

    // exported api
    // =

    // create a new context menu
    // - returns a promise that will resolve to undefined when the menu goes away
    // - example usage:
    /*
    create({
      // where to put the menu
      x: e.clientX,
      y: e.clientY,

      // align edge to right instead of left
      right: true,

      // use triangle
      withTriangle: true,

      // roomy style
      roomy: true,

      // no borders on items
      noBorders: false,

      // additional styles on dropdown-items
      style: 'font-size: 14px',

      // parent element to append to
      parent: document.body,

      // menu items
      items: [
        // icon from font-awesome
        {icon: 'fa fa-link', label: 'Copy link', click: () => writeToClipboard('...')}
      ]

      // instead of items, can give render()
      render () {
        return html`
          <img src="smile.png" onclick=${contextMenu.destroy} />
        `
      }
    }
    */
    function create (opts) {
      // destroy any existing
      destroy();

      // extract attrs
      var parent = opts.parent || document.body;

      // render interface
      parent.appendChild(new BeakerContextMenu(opts));
      document.addEventListener('keyup', onKeyUp);
      document.addEventListener('click', onClickAnywhere);

      // return promise
      return new Promise(_resolve => {
        resolve = _resolve;
      })
    }

    function destroy (value) {
      const el = document.querySelector('beaker-context-menu');
      if (el) {
        el.parentNode.removeChild(el);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('click', onClickAnywhere);
        resolve(value);
      }
    }

    // global event handlers
    // =

    function onKeyUp (e) {
      e.preventDefault();
      e.stopPropagation();

      if (e.keyCode === 27) {
        destroy();
      }
    }

    function onClickAnywhere (e) {
      if (!findParent(e.target, el => el.tagName === 'BEAKER-CONTEXT-MENU')) {
        // click is outside the context-menu, destroy
        destroy();
      }
    }

    // internal
    // =

    class BeakerContextMenu extends LitElement {
      constructor ({x, y, right, center, top, withTriangle, roomy, noBorders, style, items, render}) {
        super();
        this.x = x;
        this.y = y;
        this.right = right || false;
        this.center = center || false;
        this.top = top || false;
        this.withTriangle = withTriangle || false;
        this.roomy = roomy || false;
        this.noBorders = noBorders || false;
        this.customStyle = style || undefined;
        this.items = items;
        this.customRender = render;
      }

      // calls the global destroy
      // (this function exists so that custom renderers can destroy with this.destroy)
      destroy () {
        destroy();
      }

      // rendering
      // =

      render () {
        const cls = classMap({
          'dropdown-items': true,
          right: this.right,
          center: this.center,
          left: !this.right,
          top: this.top,
          'with-triangle': this.withTriangle,
          roomy: this.roomy,
          'no-border': this.noBorders
        });
        var style = '';
        if (this.x) style += `left: ${this.x}px; `;
        if (this.y) style += `top: ${this.y}px; `;
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="context-menu dropdown" style="${style}">
        ${this.customRender
          ? this.customRender()
          : html`
            <div class="${cls}" style="${ifDefined(this.customStyle)}">
              ${this.items.map(item => {
                if (item === '-') {
                  return html`<hr />`
                }
                if (item.type === 'html') {
                  return item
                }
                var icon = item.icon;
                if (icon && !icon.includes(' ')) {
                  icon = 'fa fa-' + icon;
                }
                if (item.disabled) {
                  return html`
                    <div class="dropdown-item disabled">
                      ${icon !== false ? html`<i class="${icon}"></i>` : ''}
                      ${item.label}
                    </div>
                  `
                }
                if (item.href) {
                  return html`
                    <a class="dropdown-item" href=${item.href}>
                      ${icon !== false ? html`<i class="${icon}"></i>` : ''}
                      ${item.label}
                    </a>
                  `
                }
                return html`
                  <div class="dropdown-item" @click=${() => { destroy(); item.click(); }}>
                    ${icon !== false ? html`<i class="${icon}"></i>` : ''}
                    ${item.label}
                  </div>
                `
              })}
            </div>`
        }
      </div>`
      }
    }

    BeakerContextMenu.styles = css`
${cssStr$9}

.context-menu {
  position: fixed;
  z-index: 10000;
}

.dropdown-items {
  width: auto;
  white-space: nowrap;
}

a.dropdown-item {
  color: inherit;
  text-decoration: none;
}

.dropdown-item,
.dropdown-items.roomy .dropdown-item {
  padding-right: 30px; /* add a little cushion to the right */
}

/* custom icon css */
.fa-long-arrow-alt-right.custom-link-icon {
  position: relative;
  transform: rotate(-45deg);
  left: 1px;
}
.fa-custom-path-icon:after {
  content: './';
  letter-spacing: -1px;
  font-family: var(--code-font);
}
`;

    customElements.define('beaker-context-menu', BeakerContextMenu);

    const cssStr$a = css`
.toast-wrapper {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 20000;
  transition: opacity 0.1s ease;
}
.toast-wrapper.hidden {
  opacity: 0;
}
.toast {
  position: relative;
  min-width: 350px;
  max-width: 450px;
  background: #ddd;
  margin: 0;
  padding: 10px 15px;
  border-radius: 4px;
  font-size: 16px;
  color: #fff;
  background: rgba(0, 0, 0, 0.75);
  -webkit-font-smoothing: antialiased;
  font-weight: 600;
}
.toast.error {
  padding-left: 38px;
}
.toast.success {
  padding-left: 48px;
}
.toast.success:before,
.toast.error:before {
  position: absolute;
  left: 18px;
  top: 5px;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Cantarell, "Oxygen Sans", "Helvetica Neue", sans-serif;
  font-size: 22px;
  font-weight: bold;
}
.toast.primary {
  background: var(--color-blue);
}
.toast.success {
  background: #26b33e;
}
.toast.success:before {
  content: '✓';
}
.toast.error {
  background: #c72e25;
}
.toast.error:before {
  content: '!';
}
.toast .toast-btn {
  position: absolute;
  right: 15px;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
`;

    // exported api
    // =

    function create$1 (message, type = '', time = 5000, button = null) {
      // destroy existing
      destroy$1();

      // render toast
      document.body.appendChild(new BeakerToast({message, type, button}));
      setTimeout(destroy$1, time);
    }

    // internal
    // =

    function destroy$1 () {
      var toast = document.querySelector('beaker-toast');

      if (toast) {
        // fadeout before removing element
        toast.classList.add('hidden');
        setTimeout(() => toast.remove(), 500);
      }
    }

    class BeakerToast extends LitElement {
      constructor ({message, type, button}) {
        super();
        this.message = message;
        this.type = type;
        this.button = button;
      }

      render () {
        const onButtonClick = this.button ? (e) => { destroy$1(); this.button.click(e); } : undefined;
        return html`
    <div id="toast-wrapper" class="toast-wrapper ${this.button ? '' : 'nomouse'}">
      <p class="toast ${this.type}">${this.message} ${this.button ? html`<a class="toast-btn" @click=${onButtonClick}>${this.button.label}</a>` : ''}</p>
    </div>
    `
      }
    }
    BeakerToast.styles = cssStr$a;

    customElements.define('beaker-toast', BeakerToast);

    const md = markdownit({
      html: false, // Enable HTML tags in source
      xhtmlOut: false, // Use '/' to close single tags (<br />)
      breaks: true, // Convert '\n' in paragraphs into <br>
      langPrefix: 'language-', // CSS language prefix for fenced blocks
      linkify: false, // Autoconvert URL-like text to links

      // Enable some language-neutral replacement + quotes beautification
      typographer: true,

      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Set doubles to '«»' for Russian, '„“' for German.
      quotes: '“”‘’',

      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed
      highlight: undefined
    });

    class Post extends LitElement {
      static get properties () {
        return {
          post: {type: Object},
          userUrl: {type: String, attribute: 'user-url'},
          expanded: {type: Boolean}
        }
      }

      static get styles () {
        return cssStr$8
      }

      constructor () {
        super();
        this.post = null;
        this.userUrl = '';
      }

      getUserVote () {
        return votes.getVoteBy(this.post && this.post.votes, this.userUrl)
      }

      getKarma () {
        var votes = this.post && this.post.votes;
        if (!votes) return undefined
        return votes.upvotes.length - votes.downvotes.length
      }

      getDriveTypeIcon (dt) {
        switch (dt) {
          case 'unwalled.garden/person': return 'fas fa-user'
          case 'unwalled.garden/module': return 'fas fa-cube'
          case 'unwalled.garden/template': return 'fas fa-drafting-compass'
          case 'webterm.sh/cmd-pkg': return 'fas fa-terminal'
          default: return 'far fa-hdd'
        }
      }

      render () {
        if (!this.post) return

        var isLink = this.post.path.endsWith('.goto');
        var isTextPost = /\.(md|txt)$/.test(this.post.path);
        var isMarkdown = this.post.path.endsWith('.md');
        var isFile = !isLink && !isTextPost;

        var postMeta = this.post.stat.metadata;
        var viewProfileUrl = '/' + this.post.drive.url.slice('hd://'.length); // TODO
        var viewPostUrl = viewProfileUrl + '/posts/' + this.post.url.split('/').slice(-2).join('/');
        var href = isLink ? postMeta.href : viewPostUrl;
        var userVote = this.getUserVote();
        var karma = this.getKarma();
        var author = this.post.drive;
        var ctime = this.post.stat.ctime; // TODO replace with rtime
        var isExpanded = this.hasAttribute('expanded');

        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="votectrl">
        <a class="upvote ${userVote === 1 ? 'selected' : ''}" @click=${this.onClickUpvote}>
          <span class="fas fa-caret-up"></span>
        </a>
        <div class="karma ${userVote === 1 ? 'upvoted' : userVote === -1 ? 'downvoted' : ''}">${karma}</div>
        <a class="downvote ${userVote === -1 ? 'selected' : ''}" @click=${this.onClickDownvote}>
          <span class="fas fa-caret-down"></span>
        </a>
      </div>
      <div class="content">
        <div>
          <a class="title" href=${href} title=${postMeta.title}>${postMeta.title}</a>
          ${postMeta['drive-type'] ? html`
            <span class="drive-type">
              <span class=${this.getDriveTypeIcon(postMeta['drive-type'])}></span>
              ${toNiceDriveType(postMeta['drive-type'])}
            </span>
          ` : ''}
          <span class="domain">
            ${isLink ? html`<span class="fas fa-link"></span> ${toNiceDomain(postMeta.href)}` : ''}
            ${isTextPost ? html`<span class="far fa-comment-alt"></span> text post` : ''}
            ${isFile ? html`<span class="far fa-file"></span> file` : ''}
          </span>
          <button class="menu transparent" @click=${this.onClickMenu}><span class="fas fa-fw fa-ellipsis-h"></span></button>
        </div>
        <div>
          <a class="topic" title=${toNiceTopic(this.post.topic)} href="/?topic=${encodeURIComponent(this.post.topic)}">${toNiceTopic(this.post.topic)}</a>
          | by <a class="author" href=${viewProfileUrl} title=${author.title}>${author.title}</a>
          | posted <a href=${viewPostUrl}>${timeDifference(ctime, true, 'ago')}</a>
          | <a class="comments" href=${viewPostUrl}>
            ${this.post.numComments} ${pluralize(this.post.numComments, 'comment')}
          </a>
        </div>
        ${isExpanded && isTextPost ? html`
          <div class="text-post-content">
            ${isMarkdown ? unsafeHTML(md.render(this.post.content)) : html`<pre>${this.post.content}</pre>`}
          </div>
        ` : ''}
        ${isExpanded && isFile ? html`
          <div class="file-content">
            <h3><span class="far fa-fw fa-file"></span> <a href=${this.post.url}>${this.post.url.split('/').pop()}</a></h3>
            ${this.renderFile()}
          </div>
        ` : undefined}
      </div>
    `
      }

      renderFile () {
        if (/\.(png|jpe?g|gif)$/i.test(this.post.path)) {
          return html`<img src=${this.post.url}>`
        }
        if (/\.(mp4|webm|mov)$/i.test(this.post.path)) {
          return html`<video controls><source src=${this.post.url}></video>`
        }
        if (/\.(mp3|ogg)$/i.test(this.post.path)) {
          return html`<audio controls><source src=${this.post.url}></audio>`
        }
      }

      // events
      // =

      async onClickUpvote (e) {
        e.preventDefault();
        e.stopPropagation();
        
        var userVote = this.getUserVote();
        await votes.put(this.post.url, userVote === 1 ? 0 : 1);
        if (userVote === 1) {
          this.post.votes.upvotes = this.post.votes.upvotes.filter(url => (url.url || url) !== this.userUrl);
        } else {
          this.post.votes.upvotes.push({url: this.userUrl});
        }
        this.requestUpdate();
      }

      async onClickDownvote (e) {
        e.preventDefault();
        e.stopPropagation();
        
        var userVote = this.getUserVote();
        await votes.put(this.post.url, userVote === -1 ? 0 : -1);
        if (userVote === -1) {
          this.post.votes.downvotes = this.post.votes.downvotes.filter(url => (url.url || url) !== this.userUrl);
        } else {
          this.post.votes.downvotes.push({url: this.userUrl});
        }
        this.requestUpdate();
      }

      onClickMenu (e) {
        e.preventDefault();
        e.stopPropagation();

        var items = [
          {icon: 'far fa-fw fa-file-alt', label: 'View post file', click: () => window.open(this.post.url) },
          {
            icon: 'fas fa-fw fa-link',
            label: 'Copy post file URL',
            click: () => {
              writeToClipboard(this.post.url);
              create$1('Copied to your clipboard');
            }
          }
        ];

        if (this.userUrl === this.post.drive.url) {
          items.push('-');
          items.push({icon: 'fas fa-fw fa-paragraph', label: 'Change post title', click: () => this.onClickChangeTitle() });
          items.push({icon: 'fas fa-fw fa-trash', label: 'Delete post', click: () => this.onClickDelete() });
        }

        var rect = e.currentTarget.getClientRects()[0];
        create({
          x: rect.left + 8,
          y: rect.bottom + 4,
          center: true,
          withTriangle: true,
          roomy: true,
          noBorders: true,
          style: `padding: 4px 0`,
          items
        });
      }

      async onClickChangeTitle () {
        var newTitle = prompt('New post title', this.post.stat.metadata.title);
        if (!newTitle) return
        newTitle = newTitle.trim();
        if (!newTitle) return
        await posts.changeTitle(this.post, newTitle);
        this.post.stat.metadata.title = newTitle;
        this.requestUpdate();
      }

      async onClickDelete () {
        if (!confirm('Are you sure?')) return
        try {
          await posts.remove(this.post);
        } catch (e) {
          console.error(e);
          create$1(e.toString(), 'error');
          return
        }
        create$1('Post deleted');
        emit(this, 'deleted', {bubbles: true, composed: true, detail: {post: this.post}});
      }
    }

    customElements.define('beaker-post', Post);

    const cssStr$b = css`
:host {
  display: flex;
}
`;

    class PostButtons extends LitElement {
      static get properties () {
        return {
          page: {type: Number},
          label: {type: String}
        }
      }

      static get styles () {
        return cssStr$b
      }

      constructor () {
        super();
        this.page = 0;
        this.label = '';
      }

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      ${this.page > 0 ? html`<a href="#" @click=${this.onClickLeft}><span class="fas fa-fw fa-caret-left"></span></a>` : ''}
      <span class="label">${this.label || this.page}</span>
      <a href="#" @click=${this.onClickRight}><span class="fas fa-fw fa-caret-right"></span></a>
    `
      }

      // events
      // =

      onClickLeft () {
        emit(this, 'change-page', {detail: {page: this.page - 1}});
      }

      onClickRight () {
        emit(this, 'change-page', {detail: {page: this.page + 1}});
      }
    }

    customElements.define('beaker-paginator', PostButtons);

    const PAGE_SIZE = 25;

    class PostsFeed extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          author: {type: String},
          topic: {type: String},
          posts: {type: Array}
        }
      }

      static get styles () {
        return cssStr$4
      }

      constructor () {
        super();
        this.user = undefined;
        this.author = undefined;
        this.topic = undefined;
        this.posts = undefined;
        this.page = 0;
      }

      async load () {
        var posts$1 = await posts.list({
          topic: this.topic,
          author: this.author ? this.author : undefined,
          offset: this.page * PAGE_SIZE,
          limit: PAGE_SIZE,
          sort: 'name',
          reverse: true
        }, {includeProfiles: true});
        /* dont await */ this.loadFeedAnnotations(posts$1);
        this.posts = posts$1;
        console.log(this.posts);
      }

      requestFeedPostsUpdate () {
        Array.from(this.shadowRoot.querySelectorAll('beaker-post'), el => el.requestUpdate());
      }

      async refreshFeed () {
        this.loadFeedAnnotations(this.posts);
      }

      async loadFeedAnnotations (posts) {
        for (let post of posts) {
    [post.votes, post.numComments] = await Promise.all([
            votes.tabulate(post.url),
            comments.count({href: post.url})
          ]);
          this.requestFeedPostsUpdate();
        }
      }

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="feed">
        ${typeof this.posts === 'undefined' ? html`
          <div class="empty">
            <span class="spinner"></span>
          </div>
        ` : html`
          ${repeat(this.posts, post => html`
            <beaker-post
              .post=${post}
              user-url="${this.user.url}"
              @deleted=${this.onPostDeleted}
            ></beaker-post>
          `)}
          ${this.posts.length === 0
            ? html`
              <div class="empty">
                <div><span class="fas fa-image"></span></div>
                <div>
                  ${this.author
                    ? 'This user has not posted anything.'
                    : 'This is your feed. It will show posts from users you follow.'}
                </div>
              </div>
            ` : ''}
          <beaker-paginator
            page=${this.page}
            label="Showing posts ${(this.page * PAGE_SIZE) + 1} - ${(this.page + 1) * PAGE_SIZE}"
            @change-page=${this.onChangePage}
          ></beaker-paginator>
        `}
      </div>
    `
      }

      // events
      // =

      onChangePage (e) {
        this.page = e.detail.page;
        this.posts = undefined;
        this.load();
      }

      async onPostDeleted (e) {
        let post = e.detail.post;
        this.posts = this.posts.filter(p => p.url !== post.url);
      }
    }

    customElements.define('beaker-posts-feed', PostsFeed);

    const cssStr$c = css`
${cssStr$6}

:host {
  display: block;
}

button {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
  padding: 10px 8px 10px 16px;
  width: 100%;
  text-align: left;
}

button .fa-fw {
  margin-right: 8px;
}
`;

    class PostButtons$1 extends LitElement {
      static get styles () {
        return cssStr$c
      }

      constructor () {
        super();
      }

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <button @click=${e => this.onClickBtn('link')}><span class="fas fa-fw fa-link"></span> Post a new link</button>
      <button @click=${e => this.onClickBtn('text')}><span class="far fa-fw fa-comment-alt"></span> Post a text post</button>
      <button @click=${e => this.onClickBtn('file')}><span class="far fa-fw fa-file"></span> Post a file</button>
    `
      }

      // events
      // =

      onClickBtn (type) {
        window.location = '/compose?type=' + type;
      }
    }

    customElements.define('beaker-post-buttons', PostButtons$1);

    const cssStr$d = css`
${cssStr$1}

:host {
  display: block;
}

h3 {
  letter-spacing: 0.5px;
}

a {
  text-decoration: none;
  color: #778;
  font-weight: 500;
}

a:hover {
  color: var(--blue);
}

p {
  margin: 12px 0;
}
`;

    class Topics extends LitElement {
      static get properties () {
        return {
          topics: {type: Array}
        }
      }

      static get styles () {
        return cssStr$d
      }

      constructor () {
        super();
        this.topics = undefined;
      }

      async load () {
        this.topics = await topics.list();
      }

      render () {
        return html`
      <h3>Topics</h3>
      <p><a href="/">All</a></p>
      ${this.topics ? this.topics.map(topic => html`
        <p><a href="/?topic=${encodeURIComponent(topic)}">${toNiceTopic(topic)}</a></p>
      `) : html`
        <div class="spinner"></div>
      `}
    `
      }

      // events
      // =
    }

    customElements.define('beaker-topics', Topics);

    class PostsView extends LitElement {
      static get properties () {
        return {
          user: {type: Object}
        }
      }
     
      createRenderRoot () {
        return this // no shadow dom
      }

      constructor () {
        super();
        this.user = undefined;
        this.topic = (new URLSearchParams(location.search)).get('topic') || undefined;
      }

      async load () {
        await this.requestUpdate();
        // Array.from(this.querySelectorAll('[loadable]'), el => el.load())
      }

      render () {
        if (!this.user) return html``
        return html`
      <div class="layout right-col">
        <main>
          <beaker-posts-feed loadable .user=${this.user} .topic=${this.topic}></beaker-posts-feed>
        </main>
        <nav>
          <beaker-post-buttons></beaker-post-buttons>
          <beaker-topics loadable></beaker-topics>
        </nav>
      </div>
    `
      }

      // events
      // =

    }

    customElements.define('beaker-posts-view', PostsView);

    const cssStr$e = css`
${cssStr}
${cssStr$1}
${cssStr$6}
${cssStr$7}

:host {
  --body-font-size: 15px;
  --header-font-size: 12px;
  --title-font-size: 13px;
  --footer-font-size: 12px;
  --title-color: var(--color-link);
  --header-color: #888;

  display: block;
  padding-right: 10px;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.comment {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: baseline;
  border-top: 1px solid #dde;
  padding: 8px 6px 16px;
}

.header {
  display: flex;
  align-items: center;
  padding: 4px 16px 4px;
  font-size: var(--header-font-size);
  line-height: var(--header-font-size);
  color: var(--header-color);
}

.header .menu {
  padding: 2px 4px;
}

.title {
  font-size: var(--title-font-size);
  color: var(--title-color);
  margin-right: 10px;
  line-height: 17px;
}

.permalink {
  color: inherit;
}

.body {
  color: rgba(0, 0, 0, 0.9);
  padding: 0 16px;
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--body-font-size);
  line-height: 1.4;
  white-space: pre-line;
}

.footer {
  padding: 0 16px;
}

.view-context {
  background: #f0f0f5;
  color: #778;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.view-context:hover {
  text-decoration: none;
  background: #eaeaef;
}

`;

    const PAGE_SIZE$1 = 25;

    class CommentsFeed extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          author: {type: String},
          comments: {type: Array}
        }
      }

      static get styles () {
        return cssStr$e
      }

      constructor () {
        super();
        this.user = undefined;
        this.author = undefined;
        this.comments = undefined;
        this.page = 0;
      }

      async load () {
        var comments$1 = await comments.list({
          author: this.author ? this.author : undefined,
          offset: this.page * PAGE_SIZE$1,
          limit: PAGE_SIZE$1,
          sort: 'name',
          reverse: true
        });
        /* dont await */ this.loadFeedAnnotations(comments$1);
        this.comments = comments$1;
        console.log(this.comments);
      }

      async loadFeedAnnotations (comments) {
        for (let comment of comments) {
          comment.votes = await votes.tabulate(comment.url);
          this.requestUpdate();
        }
      }

      getUserVote (comment) {
        var votes = comment && comment.votes;
        if (!votes) return 0
        if (votes.upvotes.find(u => u.url === this.user.url)) return 1
        if (votes.downvotes.find(u => u.url === this.user.url)) return -1
        return 0
      }

      getKarma (comment) {
        var votes = comment && comment.votes;
        if (!votes) return undefined
        return votes.upvotes.length - votes.downvotes.length
      }

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="feed">
        ${typeof this.comments === 'undefined' ? html`
          <div class="empty">
            <span class="spinner"></span>
          </div>
        ` : html`
          ${repeat(this.comments, comment => {
            var contextUrl = `/${comment.stat.metadata.href.slice('hd://'.length)}`;
            var userVote = this.getUserVote(comment);
            var karma = this.getKarma(comment);
            return html`
              <div class="comment">
                <div class="votectrl">
                  <a class="upvote ${userVote === 1 ? 'selected' : ''}" @click=${e => this.onClickUpvote(e, comment)}>
                    <span class="fas fa-caret-up"></span>
                  </a>
                  <div class="karma ${userVote === 1 ? 'upvoted' : userVote === -1 ? 'downvoted' : ''}">${karma}</div>
                  <a class="downvote ${userVote === -1 ? 'selected' : ''}" @click=${e => this.onClickDownvote(e, comment)}>
                    <span class="fas fa-caret-down"></span>
                  </a>
                </div>
                <div class="content">
                  <div class="header">
                    <a class="title" href="/${comment.drive.url.slice('hd://'.length)}">${comment.drive.title}</a>
                    <a class="permalink" href="${contextUrl}">${timeDifference(comment.stat.ctime, true, 'ago')}</a>
                    <button class="menu transparent" @click=${e => this.onClickMenu(e, comment)}><span class="fas fa-fw fa-ellipsis-h"></span></button>
                  </div>
                  <div class="body">${comment.content}</div>
                  <div class="footer">
                    <a class="view-context" href=${contextUrl}>View post</a>
                  </div>
                </div>
              </div>
            `
          })}
          ${this.comments.length === 0
            ? html`
              <div class="empty">
                <div><span class="fas fa-image"></span></div>
                <div>
                  ${this.author
                    ? 'This user has not made any comments.'
                    : 'This is the comments feed. It will show comments from users you follow.'}
                </div>
              </div>
            ` : ''}
        `}
        <beaker-paginator
          page=${this.page}
          label="Showing comments ${(this.page * PAGE_SIZE$1) + 1} - ${(this.page + 1) * PAGE_SIZE$1}"
          @change-page=${this.onChangePage}
        ></beaker-paginator>
      </div>
    `
      }

      // events
      // =

      async onClickUpvote (e, comment) {
        e.preventDefault();
        e.stopPropagation();
        
        var userVote = this.getUserVote(comment);
        await votes.put(comment.url, userVote === 1 ? 0 : 1);
        comment.votes = await votes.tabulate(comment.url);
        this.requestUpdate();
      }

      async onClickDownvote (e, comment) {
        e.preventDefault();
        e.stopPropagation();
        
        var userVote = this.getUserVote(comment);
        await votes.put(comment.url, userVote === -1 ? 0 : -1);
        comment.votes = await votes.tabulate(comment.url);
        this.requestUpdate();
      }

      onClickMenu (e, comment) {
        e.preventDefault();
        e.stopPropagation();

        var items = [
          {
            icon: 'fas fa-fw fa-link',
            label: 'Copy comment URL',
            click: () => {
              writeToClipboard(comment.url);
              create$1('Copied to your clipboard');
            }
          }
        ];

        if (this.user.url === comment.drive.url) {
          items.push({icon: 'fas fa-fw fa-trash', label: 'Delete comment', click: () => this.onClickDelete(comment) });
        }

        var rect = e.currentTarget.getClientRects()[0];
        create({
          x: rect.left,
          y: rect.bottom + 8,
          left: true,
          roomy: true,
          noBorders: true,
          style: `padding: 4px 0`,
          items
        });
      }

      onClickDelete (comment) {
        if (!confirm('Are you sure?')) return

        // TODO
        
        this.comments = this.comments.filter(c => c.url !== comment.url);
      }

      onChangePage (e) {
        this.page = e.detail.page;
        this.comments = undefined;
        this.load();
      }
    }

    customElements.define('beaker-comments-feed', CommentsFeed);

    class CommentsView extends LitElement {
      static get properties () {
        return {
          user: {type: Object}
        }
      }
     
      createRenderRoot () {
        return this // no shadow dom
      }

      constructor () {
        super();
        this.user = undefined;
      }

      async load () {
        await this.requestUpdate();
        // Array.from(this.querySelectorAll('[loadable]'), el => el.load())
      }

      render () {
        if (!this.user) return html``
        return html`
      <div class="layout right-col">
        <main>
          <beaker-comments-feed loadable .user=${this.user}></beaker-comments-feed>
        </main>
        <nav>
          <beaker-post-buttons></beaker-post-buttons>
          <beaker-topics loadable></beaker-topics>
        </nav>
      </div>
    `
      }

      // events
      // =

    }

    customElements.define('beaker-comments-view', CommentsView);

    const cssStr$f = css`
textarea {
  line-height: 1.4;
}

input,
textarea {
  height: 30px;
  padding: 0 7px;
  border-radius: 4px;
  color: rgba(51, 51, 51, 0.95);
  border: 1px solid #d9d9d9;
}
textarea {
  padding: 7px;
}

input[type="checkbox"],
input[type="radio"],
input[type="range"] {
  padding: 0;
}

input[type="checkbox"]:focus,
input[type="radio"]:focus,
input[type="range"]:focus {
  box-shadow: none;
}

input[type="radio"] {
  width: 14px;
  height: 14px;
  outline: none;
  -webkit-appearance: none;
  border-radius: 50%;
  cursor: pointer;
  transition: border 0.1s ease;
}

input[type="radio"]:hover {
  border: 1px solid var(--color-blue);
}

input[type="radio"]:checked {
  border: 4.5px solid var(--color-blue);
}

input[type="file"] {
  padding: 0;
  border: 0;
  line-height: 1;
}

input[type="file"]:focus {
  border: 0;
  box-shadow: none;
}

input:focus,
textarea:focus,
select:focus {
  outline: 0;
  border: 1px solid rgba(41, 95, 203, 0.8);
  box-shadow: 0 0 0 2px rgba(41, 95, 203, 0.2);
}

input.error,
textarea.error,
select.error {
  border: 1px solid rgba(209, 48, 39, 0.75);
}

input.error:focus,
textarea.error:focus,
select.error:focus {
  box-shadow: 0 0 0 2px rgba(204, 47, 38, 0.15);
}

input.nofocus:focus,
textarea.nofocus:focus,
select.nofocus:focus {
  outline: 0;
  box-shadow: none;
  border: initial;
}

input.inline {
  height: auto;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  cursor: text;
  padding: 3px 5px;
  line-height: 1;
}

input.big,
textarea.big {
  height: 38px;
  padding: 0 10px;
  font-size: 14px;
}

textarea.big {
  padding: 5px 10px;
}

input.huge,
textarea.huge {
  height: 40px;
  padding: 0 10px;
  font-size: 18px;
}

textarea.huge {
  padding: 5px 10px;
}

input.inline:focus,
input.inline:hover {
  border: 1px solid #ccc;
  box-shadow: none;
}

input.inline:focus {
  background: #fff;
}

.input-file-picker {
  display: flex;
  align-items: center;
  padding: 3px;
  border-radius: 2px;
  border: 1px solid #d9d9d9;
  color: var(--color-text--muted);
}

.input-file-picker span {
  flex: 1;
  padding-left: 3px;
}

::-webkit-input-placeholder {
  color: rgba(0, 0, 0, 0.5);
  font-size: 0.8rem;
}

.big::-webkit-input-placeholder,
.huge::-webkit-input-placeholder {
  font-size: 0.9em;
}

label {
  font-weight: 500;
}

input[disabled][data-tooltip],
label[disabled][data-tooltip] {
  cursor: help;
}

input[disabled][data-tooltip] *,
label[disabled][data-tooltip] * {
  cursor: help;
}

label.required:after {
  content: '*';
  color: red;
}

.toggle {
  display: flex;
  align-items: center;
  flex-direction: row;
  margin-bottom: 10px;
  cursor: pointer;
  overflow: initial;
}

.toggle .switch {
  margin-right: 10px;
}

.toggle * {
  cursor: pointer;
}

.toggle.disabled {
  cursor: default;
}

.toggle.disabled * {
  cursor: default;
}

.toggle input {
  display: none;
}

.toggle .text {
  font-weight: 400;
}

.toggle .switch {
  display: inline-block;
  position: relative;
  width: 32px;
  height: 17px;
}

.toggle .switch:before,
.toggle .switch:after {
  position: absolute;
  display: block;
  content: '';
}

.toggle .switch:before {
  width: 100%;
  height: 100%;
  border-radius: 40px;
  background: #dadada;
}

.toggle .switch:after {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  left: 3px;
  top: 3px;
  background: #fafafa;
  transition: transform 0.15s ease;
}

.toggle input:checked:not(:disabled) + .switch:before {
  background: #41b855;
}

.toggle input:checked:not(:disabled) + .switch:after {
  transform: translateX(15px);
}

.toggle.disabled {
  color: var(--color-text--light);
}

label.checkbox-container {
  display: flex;
  align-items: center;
  height: 15px;
  font-weight: 400;
}

label.checkbox-container input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0 5px 0 0;
}


`;

    const cssStr$g = css`
${cssStr$f}
${cssStr$6}
${cssStr$1}

:host {
  display: block;
  background: #fff;
  border: 1px solid #ccd;
  border-radius: 8px;
  overflow: hidden;
  max-width: 800px;
  margin: 0 auto;
}

a {
  color: var(--blue);
}

.type-selector {
  display: flex;
  border-bottom: 1px solid #ccd;
}

.type-selector a {
  flex: 1;
  border-right: 1px solid #ccd;
  border-bottom: 2px solid transparent;
  text-align: center;
  cursor: pointer;
  padding: 16px 0;
  font-size: 13px;
  font-weight: bold;
  color: #778;
}

.type-selector a:last-child {
  border-right: 0;
}

.type-selector a:hover,
.type-selector a.selected {
  color: var(--blue);
  background: #fafaff;
}

.type-selector a.selected {
  border-bottom: 2px solid var(--blue);
}

form {
  padding: 20px;
}

.form-group {
  margin-bottom: 14px;
}

textarea,
input {
  font-size: 16px;
  font-weight: 500;
  width: 100%;
  box-sizing: border-box;
}

input {
  height: 36px;
  padding: 0 12px;
}

textarea {
  min-height: 200px;
  padding: 10px 12px;
  resize: vertical;
}

.file-input {
  border: 1px solid #ccd;
  border-radius: 4px;
  padding: 12px 12px;
  color: rgba(0, 0, 0, 0.5);
  font-weight: 500;
}

.file-input .selection {
  color: #556;
  font-size: 16px;
  border-radius: 4px;
  margin-bottom: 6px;
}

#native-file-input {
  display: none;
}

.link-metadata {
  display: inline-flex;
  align-items: center;
}

.link-metadata > * {
  margin-right: 5px;
}

input.success,
textarea.success,
.file-input.success {
  border-color: var(--green);
}

input.error,
textarea.error,
.file-input.error {
  border-color: var(--red);
}

div.error {
  color: var(--red);
}

input#title {
  font-size: 18px;
  height: 44px;
  font-weight: bold;
}

input#topic {
  width: 160px;
  margin-right: 10px;
}

::-webkit-input-placeholder {
  font-size: inherit;
}

a.topic {
  color: #889;
  font-weight: 500;
  margin-right: 6px;
  text-decoration: underline;
  cursor: pointer;
  white-space: nowrap;
  line-height: 30px;
}

.actions {
  display: flex;
  align-items: center;
}

.actions button {
  margin-left: auto;
  padding: 6px 10px;
  font-size: 14px;
}
`;

    const TOPIC_LIMIT = 30;

    class PostComposer extends LitElement {
      static get properties () {
        return {
          type: {type: String},
          validation: {type: Object},
          topics: {type: Array},
          linkMetadata: {type: Object},
          file: {type: Object}
        }
      }

      constructor () {
        super();
        let qp = new URLSearchParams(location.search);
        this.type = qp.get('type') || 'link';
        this.validation = {};
        this.topics = [];
        this.linkMetadata = undefined;
        this.file = undefined;
      }

      async load () {
        this.topics = await topics.list();

        if (location.search && location.search.includes('from-cli')) {
          let params = new URLSearchParams(location.search);
          this.setType(params.get('type') || 'link');
          await this.requestUpdate();

          this.shadowRoot.querySelector('input#title').value = params.get('title');
          this.shadowRoot.querySelector('input#topic').value = params.get('topic');
          if (params.get('url')) {
            this.shadowRoot.querySelector('input#url').value = params.get('url');    
            this.queueReadUrlMetadata();    
          } else if (params.get('file')) {
            let url = params.get('file');
            let urlp = new URL(url);
            let drive = new Hyperdrive(urlp.hostname);
            let base64buf = await drive.readFile(urlp.pathname, 'base64');
            this.file = {source: 'hyperdrive', name: urlp.pathname.split('/').pop(), base64buf};
          }
          this.queueValidation();
        }
      }

      setType (type) {
        if (type === this.type) return
        this.type = type;
        this.linkMetadata = undefined;
        this.queueValidation();

        let url = new URL(window.location);
        let qp = new URLSearchParams(location.search);
        qp.set('type', type);
        url.search = qp.toString();
        history.replaceState({}, null, url.toString());
      }

      setTopic (topic) {
        this.shadowRoot.querySelector('input#topic').value = topic;
        this.runValidation();
      }

      getInputClass (id) {
        if (this.validation[id] && !this.validation[id].unset) {
          return this.validation[id].success ? 'success' : 'error'
        }
        return ''
      }

      queueValidation () {
        clearTimeout(this.qvto);
        this.qvto = setTimeout(this.runValidation.bind(this), 500);
      }

      runValidation () {
        var validation = {};

        // validate standard inputs
        var inputEls = Array.from(this.shadowRoot.querySelectorAll('input, textarea'));
        for (let el of inputEls) {
          if (el.getAttribute('type') === 'file') continue

          let {id, value} = el;
          if (value) {
            if (id === 'url') {
              if (!isValidUrl(value)) {
                validation[id] = {success: false, error: 'Please input a valid URL'};
                continue
              }
            }
            validation[id] = {success: true};
          } else {
            validation[id] = {unset: true};
          }
        }

        // validate file input
        if (this.type === 'file') {
          if (!this.file) {
            validation.file = {unset: true};
          } else {
            validation.file = {success: true};
          }
        }

        this.validation = validation;
      }

      queueReadUrlMetadata () {
        this.linkMetadata = undefined;
        clearTimeout(this.metato);
        this.metato = setTimeout(this.readUrlMetadata.bind(this), 500);
      }

      async readUrlMetadata () {
        this.linkMetadata = {loading: true};
        var url = this.shadowRoot.querySelector('input#url').value;
        var urlp = new URL(url);
        if (urlp.protocol === 'hd:') {
          if (urlp.pathname === '/') {
            try {
              let info = await (new Hyperdrive(urlp.hostname)).getInfo({timeout: 10e3});
              this.linkMetadata = {
                success: true,
                driveType: info.type
              };
              return
            } catch (e) {
              this.linkMetadata = {
                success: false,
                message: 'Failed to read metadata from URL'
              };
              return
            }
          }
        }
        this.linkMetadata = {none: true};
      }

      canSubmit () {
        if (this.type === 'link' && (!this.linkMetadata || this.linkMetadata.loading)) {
          return false
        }
        var inputs = Object.values(this.validation);
        return inputs.length > 0 && inputs.reduce((acc, input) => acc && input.success && !input.unset, true)
      }

      // rendering
      // =

      render () {
        const typeSelector = (id, label) => html`
      <a class=${id === this.type ? 'selected' : ''} @click=${e => this.setType(id)}>${label}</a>
    `;
        const input = (id, placeholder) => html`
      <input id=${id} name=${id} class=${this.getInputClass(id)} placeholder=${placeholder} @keyup=${this.onKeyup}>
      ${this.renderValidationError(id)}
    `;
        const textarea = (id, placeholder) => html`
      <textarea id=${id} name=${id} class=${this.getInputClass(id)} placeholder=${placeholder} @keyup=${this.onKeyup}></textarea>
      ${this.renderValidationError(id)}
    `;
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="type-selector">
        ${typeSelector('link', html`<span class="fas fa-fw fa-link"></span> Link`)}
        ${typeSelector('text', html`<span class="far fa-fw fa-comment-alt"></span> Text Post`)}
        ${typeSelector('file', html`<span class="far fa-fw fa-file"></span> File`)}
      </div>
      <form @submit=${this.onSubmitPost}>
        <div class="form-group">
          <div>
            ${input('topic', 'Topic')}
            ${this.topics.slice(0, TOPIC_LIMIT).map(topic => html`
              <a class="topic" @click=${e => this.setTopic(toNiceTopic(topic))}>${toNiceTopic(topic)}</a>
            `)}
          </div>
        </div>
        <div class="form-group">${input('title', 'Title')}</div>
        ${this.type === 'link' ? html`<div class="form-group">${input('url', 'URL')}</div>` : ''}
        ${this.type === 'text' ? html`<div class="form-group">${textarea('content', 'Post body (markdown is supported)')}</div>` : ''}
        ${this.type === 'file' ? this.renderFileInput() : ''}
        ${typeof this.linkMetadata !== 'undefined' ? this.renderLinkMetadata() : ''}
        <div class="actions">
          <button type="submit" class="btn primary" ?disabled=${!this.canSubmit()}>
            ${this.type === 'link' ? html`<span class="fas fa-fw fa-link"></span> Post Link` : ''}
            ${this.type === 'text' ? html`<span class="far fa-fw fa-comment-alt"></span> Post Text` : ''}
            ${this.type === 'file' ? html`<span class="far fa-fw fa-file"></span> Post File` : ''}
          </button>
        </div>
      </form>
    `
      }

      renderFileInput () {
        var selection = undefined;
        if (this.file) {
          selection = html`<div class="selection">${this.file.name}</div>`;
        }
        var success = this.validation && this.validation.file && this.validation.file.success;
        return html`
      <div class="form-group">
        <input type="file" id="native-file-input" @change=${this.onChooseFileNative}>
        <div class="file-input ${success ? 'success' : ''}">
          ${selection}
          <div>
            Select a ${this.file ? 'different' : ''} file from
            <a href="#" @click=${this.onClickSelectHyperdriveFile}>your hyperdrive</a>
            or
            <a href="#" @click=${this.onClickSelectOSFile}>your OS filesystem</a>
          </div>
        </div>
      </div>
    `
      }

      renderLinkMetadata () {
        if (this.linkMetadata.loading) {
          return html`
        <div class="link-metadata">
          <span class="spinner"></span> Reading URL metadata...
        </div>
      `
        }
        if (this.linkMetadata.none) {
          return html`
        <div class="link-metadata">
          No metadata found on this URL
        </div>
      `
        }
        if (!this.linkMetadata.success) {
          return html`
        <div class="link-metadata">
          <span class="fa-fw fas fa-exclamation-triangle"></span> Failed to load URL metadata
        </div>
      `
        }
        return html`
      <div class="link-metadata">
        <span class="fa-fw fas fa-info"></span> <strong>Drive Type:</strong> ${this.linkMetadata.driveType || 'None'}
      </div>
    `
      }

      renderValidationError (id) {
        if (this.validation[id] && this.validation[id].error) {
          return html`<div class="error">${this.validation[id].error}</div>`
        }
      }

      // events
      // =

      onKeyup (e) {
        this.queueValidation();
        if (e.target.id === 'url') {
          this.queueReadUrlMetadata();
        }
      }

      async onClickSelectHyperdriveFile (e) {
        e.preventDefault();
        e.stopPropagation();

        var sels = await navigator.selectFileDialog({
          select: ['file'],
          allowMultiple: false,
          disallowCreate: true
        });
        var base64buf = await (new Hyperdrive(sels[0].origin)).readFile(sels[0].path, 'base64');
        this.file = {source: 'hyperdrive', name: sels[0].path.split('/').pop(), base64buf};
        this.runValidation();
      }

      onClickSelectOSFile (e) {
        e.preventDefault();
        e.stopPropagation();
        this.shadowRoot.querySelector('#native-file-input').click();
      }

      onChooseFileNative (e) {
        var file = e.currentTarget.files[0];
        if (!file) return
        var fr = new FileReader();
        fr.onload = () => {
          var base64buf = fr.result.split(',').pop();
          this.file = {source: 'os', name: file.name, base64buf};
          this.runValidation();
        };
        fr.readAsDataURL(file);
      }

      async onSubmitPost (e) {
        e.preventDefault();
        e.stopPropagation();

        this.runValidation();
        if (!this.canSubmit()) return

        const getValue = id => this.shadowRoot.querySelector(`#${id}`).value;

        var path;
        try {
          if (this.type === 'link') {
            path = await posts.addLink({
              topic: getValue('topic'),
              title: getValue('title'),
              href: getValue('url'),
              driveType: this.linkMetadata.driveType
            });
          } else if (this.type === 'text') {
            path = await posts.addTextPost({
              topic: getValue('topic'),
              title: getValue('title'),
              content: getValue('content')
            });
          } else if (this.type === 'file') {
            let ext = this.file.name.split('.').pop().toLowerCase();
            if (this.file.name.indexOf('.') === -1) ext = 'txt';
            path = await posts.addFile({
              topic: getValue('topic'),
              title: getValue('title'),
              ext,
              base64buf: this.file.base64buf
            });
          }
        } catch (e) {
          create$1(e.toString(), 'error');
          console.error(e);
          return
        }

        create$1(`${ucfirst(this.type)} posted`);
        var user = await navigator.filesystem.stat('/profile');
        // TODO should use user id instead of mount key
        window.location = `/${user.mount.key}${path.slice('/profile'.length)}`;
      }
    }
    PostComposer.styles = cssStr$g;

    customElements.define('beaker-post-composer', PostComposer);

    function isValidUrl (v) {
      try {
        let url = new URL(v);
        return true
      } catch (e) {
        return false
      }
    }

    class ComposeView extends LitElement {
      static get properties () {
        return {
          user: {type: Object}
        }
      }
     
      createRenderRoot () {
        return this // no shadow dom
      }

      constructor () {
        super();
        this.user = undefined;
      }

      async load () {
        await this.requestUpdate();
        Array.from(this.querySelectorAll('[loadable]'), el => el.load());
      }

      render () {
        if (!this.user) return html``
        return html`
      <div class="layout right-col">
        <main>
          <beaker-post-composer loadable></beaker-post-composer>
        </main>
        <nav>
          <beaker-post-buttons></beaker-post-buttons>
          <beaker-topics loadable></beaker-topics>
        </nav>
      </div>
    `
      }

      // events
      // =

    }

    customElements.define('beaker-compose-view', ComposeView);

    const cssStr$h = css`
${cssStr$6}
${cssStr$f}

.popup-wrapper {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 6000;
  background: rgba(0, 0, 0, 0.45);
  font-style: normal;
  overflow-y: auto;
}

.popup-inner {
  background: #fff;
  box-shadow: 0 2px 25px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(0, 0, 0, 0.55);
  border-radius: 8px;
  width: 450px;
  margin: 80px auto;
  overflow: hidden;
}

.popup-inner .error {
  color: #d80b00 !important;
  margin: 10px 0 !important;
  font-style: italic;
}

.popup-inner .head {
  position: relative;
  background: #f1f1f6;
  padding: 7px 12px;
  box-sizing: border-box;
  width: 100%;
  border-bottom: 1px solid #e0e0ee;
  border-radius: 4px 4px 0 0;
}

.popup-inner .head .title {
  font-size: 0.95rem;
  font-weight: 500;
}

.popup-inner .head .close-btn {
  position: absolute;
  top: 8px;
  right: 12px;
  cursor: pointer;
}

.popup-inner .body {
  padding: 12px;
}

.popup-inner .body > div:not(:first-child) {
  margin-top: 20px;
}

.popup-inner p:first-child {
  margin-top: 0;
}

.popup-inner p:last-child {
  margin-bottom: 0;
}

.popup-inner select {
  height: 28px;
}

.popup-inner textarea,
.popup-inner label:not(.checkbox-container),
.popup-inner select,
.popup-inner input {
  display: block;
  width: 100%;
  box-sizing: border-box;
}

.popup-inner label.toggle {
  display: flex;
  justify-content: flex-start;
}

.popup-inner label.toggle .text {
  margin-right: 10px;
}

.popup-inner label.toggle input {
  display: none;
}

.popup-inner label {
  margin-bottom: 3px;
  color: rgba(51, 51, 51, 0.9);
}

.popup-inner textarea,
.popup-inner input {
  margin-bottom: 10px;
}

.popup-inner textarea {
  height: 60px;
  resize: vertical;
}

.popup-inner .actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

.popup-inner .actions .left,
.popup-inner .actions .link {
  margin-right: auto;
}

.popup-inner .actions .btn,
.popup-inner .actions .success,
.popup-inner .actions .primary {
  margin-left: 5px;
}

.popup-inner .actions .spinner {
  width: 10px;
  height: 10px;
  border-width: 1.2px;
}
`;

    // exported api
    // =

    class BasePopup extends LitElement {
      constructor () {
        super();

        const onGlobalKeyUp = e => {
          // listen for the escape key
          if (e.keyCode === 27) {
            this.onReject();
          }
        };
        document.addEventListener('keyup', onGlobalKeyUp);

        // cleanup function called on cancel
        this.cleanup = () => {
          document.removeEventListener('keyup', onGlobalKeyUp);
        };
      }

      get shouldCloseOnOuterClick () {
        return true
      }

      // management
      //

      static async coreCreate (parentEl, Class, ...args) {
        var popupEl = new Class(...args);
        parentEl.appendChild(popupEl);

        const cleanup = () => {
          popupEl.cleanup();
          popupEl.remove();
        };

        // return a promise that resolves with resolve/reject events
        return new Promise((resolve, reject) => {
          popupEl.addEventListener('resolve', e => {
            resolve(e.detail);
            cleanup();
          });

          popupEl.addEventListener('reject', e => {
            reject();
            cleanup();
          });
        })
      }

      static async create (Class, ...args) {
        return BasePopup.coreCreate(document.body, Class, ...args)
      }

      static destroy (tagName) {
        var popup = document.querySelector(tagName);
        if (popup) popup.onReject();
      }

      // rendering
      // =

      render () {
        let title = this.renderTitle();
        return html`
      <div class="popup-wrapper" @click=${this.onClickWrapper}>
        <div class="popup-inner">
          ${title ? html`
            <div class="head">
              <span class="title">${title}</span>
              <span title="Cancel" @click=${this.onReject} class="close-btn square">&times;</span>
            </div>
          ` : ''}
          <div class="body">
            ${this.renderBody()}
          </div>
        </div>
      </div>
    `
      }

      renderTitle () {
        // should be overridden by subclasses
        return false
      }

      renderBody () {
        // should be overridden by subclasses
      }

      // events
      // =

      onClickWrapper (e) {
        if (e.target.classList.contains('popup-wrapper') && this.shouldCloseOnOuterClick) {
          this.onReject();
        }
      }

      onReject (e) {
        if (e) e.preventDefault();
        this.dispatchEvent(new CustomEvent('reject'));
      }
    }

    BasePopup.styles = [cssStr$h];

    /* globals beaker */

    // exported api
    // =

    class EditProfilePopup extends BasePopup {
      static get properties () {
        return {
          thumbDataURL: {type: String},
          thumbExt: {type: String},
          title: {type: String},
          description: {type: String},
          errors: {type: Object}
        }
      }

      static get styles () {
        return [cssStr$h, css`
    .img-ctrl {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    img {
      border-radius: 50%;
      object-fit: cover;
      width: 130px;
      height: 130px;
      margin-bottom: 10px;
    }

    hr {
      border: 0;
      border-top: 1px solid #ccc;
      margin: 20px 0;
    }

    input[type="file"] {
      display: none;
    }

    .toggle .text {
      font-size: 13px;
      margin-left: 8px;
    }

    .form-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-align: left;
    }
    `]
      }

      constructor ({user}) {
        super();
        this.user = user;
        this.title = user.title || '';
        this.description = user.description || '';
        this.errors = {};
      }

      // management
      //

      static async create (parentEl, {user}) {
        return BasePopup.coreCreate(parentEl, EditProfilePopup, {user})
      }

      static destroy () {
        return BasePopup.destroy('beaker-edit-profile-popup')
      }

      // rendering
      // =

      renderTitle () {
        return 'Edit your profile'
      }

      renderBody () {
        return html`
      <form @submit=${this.onSubmit}>
        <div class="img-ctrl">
          <img src=${this.thumbDataURL || `asset:thumb:${this.user.url}?cache_buster=${Date.now()}`}>
          <input type="file" accept=".jpg,.jpeg,.png" @change=${this.onChooseThumbFile}>
          <button type="button" @click=${this.onClickChangeThumb} class="btn" tabindex="4">Choose Picture</button>
        </div>

        <label for="title">Name</label>
        <input autofocus name="title" tabindex="2" value=${this.title || ''} placeholder="Name" @change=${this.onChangeTitle} class=${this.errors.title ? 'has-error' : ''} />
        ${this.errors.title ? html`<div class="error">${this.errors.title}</div>` : ''}

        <label for="description">Bio / Description</label>
        <textarea name="description" tabindex="3" placeholder="Bio / Description (optional)" @change=${this.onChangeDescription} class=${this.errors.description ? 'has-error' : ''}>${this.description || ''}</textarea>
        ${this.errors.description ? html`<div class="error">${this.errors.description}</div>` : ''}

        <hr>

        <div class="form-actions">
          <button type="button" @click=${this.onClickCancel} class="btn cancel" tabindex="4">Cancel</button>
          <button type="submit" class="btn primary" tabindex="5">Save</button>
        </div>
      </form>
    `
      }

      // events
      // =

      onClickChangeThumb (e) {
        e.preventDefault();
        this.shadowRoot.querySelector('input[type="file"]').click();
      }

      onChooseThumbFile (e) {
        var file = e.currentTarget.files[0];
        if (!file) return
        var fr = new FileReader();
        fr.onload = () => {
          this.thumbExt = file.name.split('.').pop();
          this.thumbDataURL = /** @type string */(fr.result);
        };
        fr.readAsDataURL(file);
      }

      onChangeTitle (e) {
        this.title = e.target.value.trim();
      }

      onChangeDescription (e) {
        this.description = e.target.value.trim();
      }

      onClickCancel (e) {
        e.preventDefault();
        emit(this, 'reject');
      }

      async onSubmit (e) {
        e.preventDefault();

        // validate
        this.errors = {};
        if (!this.title) this.errors.title = 'Required';
        if (Object.keys(this.errors).length > 0) {
          return this.requestUpdate()
        }

        try {
          let drive = new Hyperdrive(this.user.url);
          await drive.configure({
            title: this.title,
            description: this.description
          });
          if (this.thumbDataURL) {
            await Promise.all([
              drive.unlink('/thumb.jpg').catch(e => undefined),
              drive.unlink('/thumb.jpeg').catch(e => undefined),
              drive.unlink('/thumb.png').catch(e => undefined)
            ]);
            var thumbBase64 = this.thumbDataURL ? this.thumbDataURL.split(',').pop() : undefined;
            await drive.writeFile(`/thumb.${this.thumbExt}`, thumbBase64, 'base64');
          }
          emit(this, 'resolve');
        } catch (e) {
          create$1(e.toString(), 'error');
        }
      }
    }

    customElements.define('beaker-edit-profile-popup', EditProfilePopup);

    const cssStr$i = css`
${cssStr$6}
${cssStr$1}

:host {
  display: grid;
  border-radius: 4px;
  grid-template-columns: 150px 1fr;
  align-items: center;
  grid-gap: 20px;
  border: 1px solid #ccd;
  overflow: hidden;
}

a {
  color: var(--blue);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

img {
  display: block;
  margin: 0 auto;
  width: 150px;
  height: 150px;
  object-fit: cover;
}

.title,
.info {
  margin: 0 0 4px;
}

.title {
  font-size: 31px;
  letter-spacing: 0.65px;
}

.title a {
  color: inherit;
}

.info {
  font-size: 15px;
  letter-spacing: 0.35px;
}

.ctrls {
  margin: 10px 0 0;
}

.info .fa-fw {
  font-size: 11px;
  color: #778;
}

button {
  font-size: 14px;
  padding: 6px 12px;
}

button .fa-fw {
  font-size: 13px;
  margin-right: 2px;
}

`;

    /*
    Usage:

    <beaker-img-fallbacks>
      <img src="/foo.png" slot="img1">
      <img src="/bar.png" slot="img2">
      <img src="/baz.png" slot="img3">
    </beaker-img-fallbacks>
    */

    class ImgFallbacks extends LitElement {
      static get properties () {
        return {
          currentImage: {type: Number}
        }
      }

      constructor () {
        super();
        this.currentImage = 1;
      }

      render () {
        return html`<slot name="img${this.currentImage}" @slotchange=${this.onSlotChange}></slot>`
      }

      onSlotChange (e) {
        var img = this.shadowRoot.querySelector('slot').assignedElements()[0];
        if (img) img.addEventListener('error', this.onError.bind(this));
      }

      onError (e) {
        this.currentImage = this.currentImage + 1;
      }
    }

    customElements.define('beaker-img-fallbacks', ImgFallbacks);

    class ProfileHeader extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          id: {type: String},
          profile: {type: Object}
        }
      }

      static get styles () {
        return cssStr$i
      }

      constructor () {
        super();
        this.user = undefined;
        this.id = undefined;
        this.profile = undefined;
      }

      async load () {
        this.profile = await profiles.get(this.id);
        await this.requestUpdate();
        await profiles.readSocialGraph(this.profile, this.user);
        await this.requestUpdate();
      }

      render () {
        if (!this.profile) return html`<span class="spinner"></span>`
        var id = this.profile.url.slice('hd://'.length);
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <a class="avatar" href="/${id}">
        <beaker-img-fallbacks>
          <img src="${this.profile.url}/thumb" slot="img1">
          <img src="/img/default-user-thumb.jpg" slot="img2">
        </beaker-img-fallbacks>
      </a>
      <div class="main">
        <h1 class="title"><a href="/${id}">${this.profile.title}</a></h1>
        <p class="info">
          <a class="id" href=${this.profile.url}>pfrazee.com</a>
        </p>
        <p class="info">
          <span class="description">${this.profile.description}</span>
        </p>
        <p class="ctrls">
          ${this.profile.isUser ? html`
            <button class="" @click=${this.onEditProfile}>
              <span class="fas fa-fw fa-user-edit"></span>
              Edit your profile
            </button>
          ` : typeof this.profile.isUserFollowing === 'undefined' ? html`
            <span class="spinner" style="position: absolute; top: 10px; right: 10px"></span>
          ` : html`
            <button class="" @click=${this.onToggleFollow}>
              ${this.profile.isUserFollowing ? html`
                <span class="fas fa-fw fa-user-minus"></span> Unfollow
              ` : html`
                <span class="fas fa-fw fa-user-plus"></span> Follow
              `}
            </button>
          `}
        </p>
      </div>
    `
      }

      // events
      // =

      async onEditProfile (e) {
        try {
          await EditProfilePopup.create(document.body, {user: this.profile});
          this.load();
        } catch (e) {
          // ignore
        }
      }

      async onToggleFollow (e) {
        try {
          if (this.profile.isUserFollowing) {
            await follows.remove(this.profile.url);
            create$1(`Unfollowed ${this.profile.title}`);
          } else {
            await follows.add(this.profile.url, this.profile.title);
            create$1(`Followed ${this.profile.title}`);
          }
        } catch (e) {
          create$1(e.toString(), 'error');
          console.log(e);
          return
        }
        this.load();
      }

    }

    customElements.define('beaker-profile-header', ProfileHeader);

    const cssStr$j = css`
${cssStr$6}
${cssStr$1}

:host {
  display: block;
  position: relative;
  border: 1px solid #ccd;
  border-radius: 4px;
  box-sizing: border-box;
  padding: 16px 12px 16px 16px;
  margin: 0px 0 10px;
}

:host(.dark) {
  background: #f9f9fc;
  border: 0;
}

a {
  color: #889;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

img {
  display: block;
  margin: 0 auto;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #ccd;
}

.title {
  font-size: 24px;
  margin: 12px 0 0;
  line-height: 1;
  text-align: center;
}

.title a {
  color: inherit;
}

.info {
  font-size: 14px;
  margin: 6px 0 0;
  text-align: center;
}

.id {
  font-size: 15px;
}

.ctrls {
  margin: 14px 0 0;
}

button {
  display: block;
  font-size: 14px;
  width: 100%;
  padding: 8px 12px !important;
}

button .fa-fw {
  margin-right: 4px;
}

button:hover {
  background: #eef !important;
}

`;

    class ProfileAside extends ProfileHeader {
      static get styles () {
        return cssStr$j
      }
    }

    customElements.define('beaker-profile-aside', ProfileAside);

    const cssStr$k = css`
${cssStr$6}
${cssStr$7}

:host {
  --body-font-size: 15px;
  --header-font-size: 12px;
  --title-font-size: 13px;
  --footer-font-size: 12px;
  --title-color: var(--color-link);
  --header-color: #888;
  --footer-color: #888;
  --footer-background: #fff;
  --replies-left-margin: 12px;
  --comment-top-margin: 16px;
  --comment-left-margin: 2px;
  --composer-padding: 14px 18px;
  --composer-margin: 0;
  --composer-border: 1px solid #ccd;

  display: block;
  border-radius: 4px;
  background: #fff;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

beaker-comment-composer {
  border: var(--composer-border);
  padding: var(--composer-padding);
  margin: var(--composer-margin);
}

.comments {
}

.comments .comments {
  margin-left: var(--replies-left-margin);
}

.comment {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: baseline;
  margin-top: var(--comment-top-margin);
  margin-left: var(--comment-left-margin);
  border-left: 2px solid #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  padding: 4px 16px 4px;
  font-size: var(--header-font-size);
  line-height: var(--header-font-size);
  color: var(--header-color);
}

.header .menu {
  padding: 2px 4px;
}

.title {
  font-size: var(--title-font-size);
  color: var(--title-color);
  margin-right: 10px;
  line-height: 17px;
}

.body {
  color: rgba(0, 0, 0, 0.9);
  padding: 0 16px;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--body-font-size);
  line-height: 1.4;
  white-space: pre-line;
}

.footer {
  display: flex;
  align-items: center;
  font-size: var(--footer-font-size);
  color: var(--footer-color);
  background: var(--footer-background);
  padding: 4px 14px;
}

beaker-reactions {
  display: flex;
  flex-wrap: wrap;
  margin-left: 4px;
}

.footer > a,
.footer > span {
  margin: 0 5px;
  color: inherit;
}

.footer > a:first-child,
.footer > span:first-child {
  margin-left: 0;
}

.permalink {
  color: inherit;
}

.comment beaker-comment-composer {
  margin: 10px 16px;
  --input-font-size: var(--body-font-size);
}

`;

    const cssStr$l = css`
${cssStr$f}
${cssStr$6}

:host {
  display: block;
  position: relative;
  background: #fff;
  padding: 14px 18px;
  border: 1px solid #ccd;
  border-radius: 4px;
  overflow: hidden;
  --input-font-size: 14px;
}

.input-placeholder,
textarea {
  padding: 0;
  font-size: var(--input-font-size);
}

textarea::-webkit-input-placeholder {
  line-height: inherit;
  font-size: var(--input-font-size);
}

.input-placeholder {
  cursor: text;
  color: #aaa;
  font-weight: 400;
}

textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  height: auto;
  min-height: 70px;
  resize: none;
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}

.actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
}

.actions button {
  margin-left: auto;
}
`;

    class CommentComposer extends LitElement {
      static get properties () {
        return {
          isEditing: {type: Boolean, attribute: 'editing'},
          href: {type: String},
          parent: {type: String},
          comment: {type: Object},
          isFocused: {type: Boolean},
          draftText: {type: String},
          placeholder: {type: String}
        }
      }

      constructor () {
        super();
        this.isEditing = false;
        this.href = '';
        this.parent = '';
        this.comment = undefined;
        this.isFocused = false;
        this.draftText = '';
        this.placeholder = 'Write a new comment';
      }

      updated (changedProperties) {
        if (this.isEditing && changedProperties.has('comment')) {
          this.draftText = this.comment.content;
        }
      }

      _submit () {
        if (!this.draftText) return
        var detail = {
          isEditing: this.isEditing,
          editTarget: this.comment,
          href: this.href,
          parent: this.parent || undefined,
          content: this.draftText
        };
        emit(this, 'submit-comment', {bubbles: true, detail});
        this.draftText = '';
      }

      focus () {
        this.shadowRoot.querySelector('textarea').focus();
      }

      // rendering
      // =

      render () {
        return html`
      <textarea
        placeholder="Enter your comment here"
        @keydown=${this.onKeydownTextarea}
        @keyup=${this.onChangeTextarea}
      >${this.draftText}</textarea>
      <div class="actions">
        <button
          class="btn primary"
          ?disabled=${this.draftText.length === 0}
          @click=${this.onClickPost}
        >${this.isEditing ? 'Update' : 'Post'}</button>
      </div>
    `
      }

      // events
      // =

      onKeydownTextarea (e) {
        // check for cmd/ctrl+enter
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.currentTarget.value = '';
          e.currentTarget.blur();
          return this._submit()
        }
        this.onChangeTextarea(e);
      }

      onChangeTextarea (e) {
        this.draftText = e.currentTarget.value;
      }

      onClickPost () {
        this._submit();
      }
    }
    CommentComposer.styles = cssStr$l;

    customElements.define('beaker-comment-composer', CommentComposer);

    class CommentsThread extends LitElement {
      static get properties () {
        return {
          comments: {type: Array},
          href: {type: String},
          userUrl: {type: String, attribute: 'user-url'},
          activeReplies: {type: Object},
          activeEdits: {type: Object},
          composerPlaceholder: {type: String, attribute: 'composer-placeholder'}
        }
      }

      constructor () {
        super();
        this.comments = null;
        this.href = '';
        this.userUrl = '';
        this.activeReplies = {};
        this.activeEdits = {};
        this.composerPlaceholder = undefined;
      }

      getUserVote (comment) {
        return votes.getVoteBy(comment && comment.votes, this.userUrl)
      }

      getKarma (comment) {
        var votes = comment && comment.votes;
        if (!votes) return undefined
        return votes.upvotes.length - votes.downvotes.length
      }

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <beaker-comment-composer
        href="${this.href}"
        placeholder=${this.composerPlaceholder || 'Add a comment'}
      ></beaker-comment-composer>
      ${this.renderComments(this.comments)}
    `
      }

      renderComments (comments) {
        if (!comments.length) return ''
        return html`
      <div class="comments">
        ${repeat(comments, c => c.url, c => this.renderComment(c))}
      </div>
    `
      }

      renderComment (comment) {
        var userVote = this.getUserVote(comment);
        var karma = this.getKarma(comment);
        return html`
      <div class="comment">
        <div class="votectrl">
          <a class="upvote ${userVote === 1 ? 'selected' : ''}" @click=${e => this.onClickUpvote(e, comment)}>
            <span class="fas fa-caret-up"></span>
          </a>
          <div class="karma ${userVote === 1 ? 'upvoted' : userVote === -1 ? 'downvoted' : ''}">${karma}</div>
          <a class="downvote ${userVote === -1 ? 'selected' : ''}" @click=${e => this.onClickDownvote(e, comment)}>
            <span class="fas fa-caret-down"></span>
          </a>
        </div>
        <div class="content">
          <div class="header">
            <a class="title" href="/${comment.drive.url.slice('hd://'.length)}">${comment.drive.title}</a>
            <a class="permalink" href="${comment.url}">${timeDifference(comment.stat.ctime, true, 'ago')}</a>
            <button class="menu transparent" @click=${e => this.onClickMenu(e, comment)}><span class="fas fa-fw fa-ellipsis-h"></span></button>
          </div>
          <div class="body">${comment.content}</div>
          <div class="footer">
            <a href="#" @click=${e => this.onClickToggleReply(e, comment.url)}>
              ${this.activeReplies[comment.url]
                ? html`<span class="fas fa-fw fa-times"></span> Cancel reply`
                : html`<span class="fas fa-fw fa-reply"></span> Reply`}
            </a>
            ${comment.drive.url === this.userUrl ? html`
              <a href="#" @click=${e => this.onClickToggleEdit(e, comment.url)}>
                ${this.activeEdits[comment.url]
                  ? html`<span class="fas fa-fw fa-times"></span> Cancel edit`
                  : html`<span class="fas fa-fw fa-pencil-alt"></span> Edit`}
              </a>
            ` : ''}
          </div>
          ${this.activeReplies[comment.url] ? html`
            <beaker-comment-composer
              href="${comment.stat.metadata.href}"
              parent="${comment.url}"
              @submit-comment=${e => this.onSubmitComment(e, comment.url)}
            ></beaker-comment-composer>
          ` : ''}
          ${this.activeEdits[comment.url] ? html`
            <beaker-comment-composer
              editing
              href="${comment.stat.metadata.href}"
              parent="${comment.url}"
              .comment=${comment}
              @submit-comment=${e => this.onSubmitEdit(e, comment.url)}
            ></beaker-comment-composer>
          ` : ''}
          ${comment.replies && comment.replies.length ? this.renderComments(comment.replies) : ''}
        </div>
      </div>
    `
      }

      // events
      // =

      async onClickToggleReply (e, url) {
        this.activeReplies[url] = !this.activeReplies[url];
        this.activeEdits[url] = false;
        await this.requestUpdate();
        if (this.activeReplies[url]) {
          this.shadowRoot.querySelector(`beaker-comment-composer[parent="${url}"]`).focus();
        }
      }

      async onClickToggleEdit (e, url) {
        this.activeEdits[url] = !this.activeEdits[url];
        this.activeReplies[url] = false;
        await this.requestUpdate();
        if (this.activeEdits[url]) {
          this.shadowRoot.querySelector(`beaker-comment-composer[parent="${url}"]`).focus();
        }
      }

      onSubmitComment (e, url) {
        this.activeReplies[url] = false;
        this.requestUpdate();
      }

      onSubmitEdit (e, url) {
        this.activeEdits[url] = false;
        this.requestUpdate();
      }

      async onClickUpvote (e, comment) {
        e.preventDefault();
        e.stopPropagation();
        
        var userVote = this.getUserVote(comment);
        await votes.put(comment.url, userVote === 1 ? 0 : 1);
        if (userVote === 1) {
          comment.votes.upvotes = comment.votes.upvotes.filter(url => url !== this.userUrl);
        } else {
          comment.votes.upvotes.push(this.userUrl);
        }
        this.requestUpdate();
      }

      async onClickDownvote (e, comment) {
        e.preventDefault();
        e.stopPropagation();
        
        var userVote = this.getUserVote(comment);
        await votes.put(comment.url, userVote === -1 ? 0 : -1);
        if (userVote === -1) {
          comment.votes.downvotes = comment.votes.downvotes.filter(url => url !== this.userUrl);
        } else {
          comment.votes.downvotes.push(this.userUrl);
        }
        this.requestUpdate();
      }

      onClickMenu (e, comment) {
        e.preventDefault();
        e.stopPropagation();

        var items = [
          {
            icon: 'fas fa-fw fa-link',
            label: 'Copy comment URL',
            click: () => {
              writeToClipboard(comment.url);
              create$1('Copied to your clipboard');
            }
          }
        ];

        if (this.userUrl === comment.drive.url) {
          items.push({icon: 'fas fa-fw fa-trash', label: 'Delete comment', click: () => this.onClickDelete(comment) });
        }

        var rect = e.currentTarget.getClientRects()[0];
        create({
          x: rect.left,
          y: rect.bottom + 8,
          left: true,
          roomy: true,
          noBorders: true,
          style: `padding: 4px 0`,
          items
        });
      }

      onClickDelete (comment) {
        if (!confirm('Are you sure?')) return
        emit(this, 'delete-comment', {bubbles: true, composed: true, detail: {comment}});
      }
    }
    CommentsThread.styles = cssStr$k;

    customElements.define('beaker-comments-thread', CommentsThread);

    class PostView extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          author: {type: String},
          topic: {type: String},
          filename: {type: String},
          post: {type: Object}
        }
      }
     
      createRenderRoot () {
        return this // no shadow dom
      }

      constructor () {
        super();
        this.user = undefined;
        this.author = undefined;
        this.topic = undefined;
        this.filename = undefined;
        this.post = undefined;
      }

      get path () {
        return `/posts/${this.topic}/${this.filename}`
      }

      async load () {
        var post = await posts.get(this.author, this.path)
        ;[post.votes, post.numComments] = await Promise.all([
          votes.tabulate(post.url, undefined, {includeProfiles: true}),
          comments.count({href: post.url})
        ]);
        this.post = post;
        console.log(this.post);

        await this.requestUpdate();
        Array.from(this.querySelectorAll('[loadable]'), el => el.load());

        var comments$1 = await comments.thread(post.url);
        await loadCommentAnnotations(comments$1);
        post.comments = comments$1;
        await this.requestUpdate();
      }

      render () {
        if (!this.post) return html``
        return html`
      <style>
        beaker-post {
          margin-bottom: 16px;
        }
        .votes {
          margin: -14px 0 10px 40px;
          color: #667;
          font-size: 12px;
          background: #f8f8fc;
          padding: 6px 10px;
          border-radius: 4px;
        }
        .votes strong {
          font-weight: 500;
        }
        .votes a {
          color: inherit;
          text-decoration: none;
        }
        .votes a:hover {
          text-decoration: underline;
        }
        beaker-comments-thread {
          margin-left: 40px;
          margin-bottom: 100px;
        }
      </style>
      <div class="layout right-col">
        <main>
          <beaker-post
            expanded
            .post=${this.post}
            user-url="${this.user ? this.user.url : undefined}"
            @deleted=${this.onPostDeleted}
          ></beaker-post>
          ${this.post.votes.upvotes.length || this.post.votes.downvotes.length ? html`
            <div class="votes">
              ${this.post.votes.upvotes.length ? html`
                <div>
                  <strong>Upvoted by:</strong>
                  ${this.renderVoters(this.post.votes.upvotes)}
                </div>
              ` : ''}
              ${this.post.votes.downvotes.length ? html`
                <div>
                  <strong>Downvoted by:</strong>
                  ${this.renderVoters(this.post.votes.downvotes)}
                </div>
              ` : ''}
            </div>
          ` : ''}
          ${this.post.comments ? html`
            <beaker-comments-thread
              .comments=${this.post ? this.post.comments : undefined}
              href="${this.post ? this.post.url : undefined}"
              user-url="${this.user ? this.user.url : undefined}"
              @submit-comment=${this.onSubmitComment}
              @delete-comment=${this.onDeleteComment}
            ></beaker-comments-thread>
          ` : html`<div class="spinner" style="margin-left: 40px"></div>`}
        </main>
        <aside>
          <beaker-profile-aside class="dark" loadable .user=${this.user} id=${this.author}></beaker-profile-aside>
          <beaker-post-buttons></beaker-post-buttons>
          <beaker-topics loadable></beaker-topics>
        </aside>
      </div>
    `
      }

      renderVoters (voters) {
        var els = [];
        for (let i = 0; i < voters.length; i++) {
          let profile = voters[i];
          let comma = (i !== voters.length - 1) ? ', ' : '';
          els.push(html`
        <a href=${'beaker://social/' + profile.url.slice('hd://'.length)} title=${profile.title}>${profile.title}</a>${comma}
      `);
        }
        return els
      }

      // events
      // =

      async onClickNav (id) {
        this.subview = id;
        await this.requestUpdate();
        Array.from(this.querySelectorAll('[loadable]'), el => el.load());
      }

      async onSubmitComment (e) {
        // add the new comment
        try {
          var {isEditing, editTarget, href, parent, content} = e.detail;
          if (isEditing) {
            await comments.update(editTarget, {content});
          } else {
            await comments.add({href, parent, content});
          }
        } catch (e) {
          alert('Something went wrong. Please let the Beaker team know! (An error is logged in the console.)');
          console.error('Failed to add comment');
          console.error(e);
          return
        }
        this.load();
      }

      async onDeleteComment (e) {
        let comment = e.detail.comment;

        // delete the comment
        try {
          await comments.remove(comment);
        } catch (e) {
          alert('Something went wrong. Please let the Beaker team know! (An error is logged in the console.)');
          console.error('Failed to delete comment');
          console.error(e);
          return
        }
        create$1('Comment deleted');
        this.load();
      }

      async onPostDeleted (e) {
        window.location = `/${this.author}`;
      }
    }

    customElements.define('beaker-post-view', PostView);

    async function loadCommentAnnotations (comments) {
      await Promise.all(comments.map(async (comment) => {
        comment.votes = await votes.tabulate(comment.url);
        if (comment.replies) await loadCommentAnnotations(comment.replies);
      }));
      comments.sort((a, b) => {
        return (b.votes.upvotes.length - b.votes.downvotes.length) - (a.votes.upvotes.length - a.votes.downvotes.length)
      });
    }

    const cssStr$m = css`
${cssStr$6}
${cssStr$1}

a {
  color: var(--blue);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.profile {
  display: grid;
  border-radius: 4px;
  grid-template-columns: 150px 1fr;
  align-items: center;
  grid-gap: 20px;
  border: 1px solid #ccd;
  margin-bottom: 10px;
}

.avatar {
  align-self: stretch;
}

img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}

.main {
  padding: 10px;
}

.title,
.info {
  margin: 0 0 4px;
}

.title {
  font-size: 24px;
  letter-spacing: 0.65px;
}

.title a {
  color: inherit;
}

.title small {
  font-size: 14px;
  font-weight: 400;
}

.info {
  font-size: 15px;
  letter-spacing: 0.35px;
}

.ctrls {
  margin: 10px 0 0;
}

.info .fa-fw {
  font-size: 11px;
  color: #778;
}

button {
  font-size: 14px;
  padding: 6px 12px;
}

button .fa-fw {
  font-size: 13px;
  margin-right: 2px;
}

`;

    class ProfileList extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          query: {type: String},
          source: {type: String},
          profiles: {type: Array}
        }
      }

      static get styles () {
        return cssStr$m
      }

      constructor () {
        super();
        this.user = undefined;
        this.profiles = undefined;
        this.query = undefined;
        this.source = undefined;
      }

      async load () {
        if (this.query === 'following') {
          this.profiles = (await follows.list({author: this.source}, {includeProfiles: true})).map(relation => relation.mount);
        } else if (this.query === 'followers') {
          this.profiles = (await follows.list({target: this.source}, {includeProfiles: true})).map(relation => relation.drive);
        }
        console.log(this.profiles);
        await this.requestUpdate();

        for (let profile of this.profiles) {
          profile.isUserFollowing = await follows.exists({author: this.user.url, target: profile.url});
          profile.isFollowingUser = await follows.exists({target: this.user.url, author: profile.url});
          await this.requestUpdate();
        }
      }

      render () {
        if (!this.profiles) return html`<span class="spinner"></span>`
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="profiles">
        ${repeat(this.profiles, profile => this.renderProfile(profile))}
      </div>
    `
      }
       
      renderProfile (profile) {
        var id = profile.url.slice('hd://'.length);
        return html`
      <div class="profile">
        <a class="avatar" href="/${id}">
          <beaker-img-fallbacks>
            <img src="${profile.url}/thumb" slot="img1">
            <img src="/img/default-user-thumb.jpg" slot="img2">
          </beaker-img-fallbacks>
        </a>
        <div class="main">
          <h1 class="title">
            <a href="/${id}">${profile.title}</a>
            ${profile.isFollowingUser ? html`<small>follows you</small>` : ''}
          </h1>
          <p class="info">
            <a class="id" href=${profile.url}>${id}</a>
          </p>
          <p class="info">
            <span class="description">${profile.description}</span>
          </p>
          <p class="ctrls">
            ${profile.isUser ? html`
              This is you
            ` : typeof profile.isUserFollowing === 'undefined' ? html`
              <span class="spinner" style="position: absolute; top: 10px; right: 10px"></span>
            ` : html`
              <button class="" @click=${e => this.onToggleFollow(e, profile)}>
                ${profile.isUserFollowing ? html`
                  <span class="fas fa-fw fa-user-minus"></span> Unfollow
                ` : html`
                  <span class="fas fa-fw fa-user-plus"></span> Follow
                `}
              </button>
            `}
          </p>
        </div>
      </div>
    `
      }

      // events
      // =

      async onToggleFollow (e, profile) {
        try {
          if (profile.isUserFollowing) {
            await follows.remove(profile.url);
            profile.isUserFollowing = false;
            create$1(`Unfollowed ${profile.title}`);
          } else {
            await follows.add(profile.url, profile.title);
            profile.isUserFollowing = true;
            create$1(`Followed ${profile.title}`);
          }
        } catch (e) {
          create$1(e.toString(), 'error');
          console.log(e);
          return
        }

        await this.requestUpdate();
      }

    }

    customElements.define('beaker-profile-list', ProfileList);

    class ProfileView extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          profileId: {type: String, attribute: 'profile-id'},
          subview: {type: String}
        }
      }
     
      createRenderRoot () {
        return this // no shadow dom
      }

      constructor () {
        super();
        this.user = undefined;
        this.profileId = undefined;
        this.subview = 'posts';
        this.following = [];
        this.followers = [];
      }

      async load () {
        this.following = await follows.list({author: this.profileId}, {includeProfiles: false});
        this.followers = await follows.list({target: this.profileId}, {includeProfiles: false});
        await this.requestUpdate();
        // Array.from(this.querySelectorAll('[loadable]'), el => el.load())
      }

      render () {
        if (!this.user) return html``
        const navItem = (id, label) => html`
      <a
        class=${this.subview === id ? 'selected' : ''}
        href="/${this.profileId}/${id}"
      >${label}</a>
    `;
        return html`
      <div class="layout left-col">
        <nav>
          <beaker-profile-aside loadable .user=${this.user} id=${this.profileId}></beaker-profile-aside>
        </nav>
        <main>
          <nav class="pills">
            ${navItem('posts', 'Posts')}
            ${navItem('comments', 'Comments')}
            ${navItem('followers', `Followers (${this.followers.length})`)}
            ${navItem('following', `Following (${this.following.length})`)}
          </nav>
          ${this.renderSubview()}
        </main>
      </div>
    `
      }

      renderSubview () {
        if (this.subview === 'posts') {
          return html`<beaker-posts-feed loadable .user=${this.user} author=${this.profileId}></beaker-posts-feed>`
        }
        if (this.subview === 'comments') {
          return html`<beaker-comments-feed loadable .user=${this.user} author=${this.profileId}></beaker-comments-feed>`
        }
        if (this.subview === 'followers') {
          return html`<beaker-profile-list loadable .user=${this.user} query="followers" source=${this.profileId}></beaker-profile-list>`
        }
        if (this.subview === 'following') {
          return html`<beaker-profile-list loadable .user=${this.user} query="following" source=${this.profileId}></beaker-profile-list>`
        }
      }

      // events
      // =

    }

    customElements.define('beaker-profile-view', ProfileView);

    const cssStr$n = css`
${cssStr}
${cssStr$1}
${cssStr$6}

:host {
  --body-font-size: 15px;
  --header-font-size: 12px;
  --title-font-size: 13px;
  --footer-font-size: 12px;
  --title-color: var(--color-link);
  --header-color: #888;

  display: block;
  padding-right: 10px;
}

.notification {
  display: grid;
  grid-template-columns: 40px 1fr;
  align-items: center;
  padding: 16px 16px;
  border-top: 1px solid #ccd;
  color: var(--blue);
  text-decoration: none;
}

.notification:hover {
  background: #f3f3fa;
}

.notification.unread {
  background: #dcedff;
  border-top-color: var(--blue);
}

.notification.unread:hover {
  background: #ccddef;
}

.icon {
  font-size: 24px;
  color: #2864dc7a;
}

.notification .description,
.notification .target {
  display: block;
}

.notification .target .post {
  font-size: 17px;
  font-weight: bold;
}

.notification .target .comment {
  display: block;
  margin-top: 2px;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #dde;
}

.notification.unread .target .comment {
  border-color: #80a1e2;
}

`;

    const PAGE_SIZE$2 = 50;

    class NotificationsFeed extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          notifications: {type: Array}
        }
      }

      static get styles () {
        return cssStr$n
      }

      constructor () {
        super();
        this.user = undefined;
        this.notifications = undefined;
        this.page = 0;
      }

      async load () {
        var notifications = await list({
          offset: this.page * PAGE_SIZE$2,
          limit: PAGE_SIZE$2
        });
        /* dont await */ this.loadFeedInformation(notifications);
        this.notifications = notifications;
        console.log(this.notifications);
      }

      async loadFeedInformation (notifications) {
        for (let notification of notifications) {
          try {
            let [authorProfile, targetContent] = await Promise.all([
              profiles.get(notification.author),
              this.fetchTargetContent(notification)
            ]);
            notification.authorProfile = authorProfile;
            notification.targetContent = targetContent;
            this.requestUpdate();
          } catch (e) {
            console.error('Failed to fetch notification content', e);
          }
        }
      }

      fetchTargetContent (notification) {
        if (notification.event === 'comment' || notification.event === 'vote') {
          if (notification.detail.href.includes('/comments/')) {
            let urlp = new URL(notification.detail.href);
            return comments.get(urlp.origin, urlp.pathname).catch(err => notification.detail.href)
          }
          if (notification.detail.href.includes('/posts/')) {
            let urlp = new URL(notification.detail.href);
            return posts.get(urlp.origin, urlp.pathname).catch(err => notification.detail.href)
          }
        }
        return 'your content'
      }

      getHref (notification) {
        if (notification.event === 'comment' || notification.event === 'vote') {
          if (notification.detail.href.includes('/comments/')) {
            return `beaker://social/${notification.detail.href.slice('hd://'.length)}`
          }
          if (notification.detail.href.includes('/posts/')) {
            return `beaker://social/${notification.detail.href.slice('hd://'.length)}`
          }
        }
      }

      getIcon (notification) {
        if (notification.event === 'comment') {
          return 'far fa-comment'
        }
        if (notification.event === 'vote') {
          if (notification.detail.vote == -1) {
            return 'fas fa-arrow-down'
          }
          return 'fas fa-arrow-up'
        }
        return ''
      }

      getPastTenseAction (notification) {
        if (notification.event === 'comment') {
          return 'replied to'
        }
        if (notification.event === 'vote') {
          if (notification.detail.vote == -1) {
            return 'downvoted'
          }
          return 'upvoted'
        }
        return 'did something? to'
      }

      getContentType (notification) {
        if (notification.event === 'comment' || notification.event === 'vote') {
          if (notification.detail.href.includes('/comments/')) {
            return 'your comment'
          }
          if (notification.detail.href.includes('/posts/')) {
            return 'your post'
          }
        }
        return 'your content'
      }

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="feed">
        ${typeof this.notifications === 'undefined' ? html`
          <div class="empty">
            <span class="spinner"></span>
          </div>
        ` : html`
          ${repeat(this.notifications, notification => {
            return html`
              <a class="notification ${notification.isRead ? '' : 'unread'}" href=${this.getHref(notification)}>
                <span class="icon">
                  <span class=${this.getIcon(notification)}></span>
                </span>
                <span class="content">
                  <span class="description">
                    <span class="author">${notification.authorProfile ? notification.authorProfile.title : toNiceUrl(notification.author)}</span>
                    ${this.getPastTenseAction(notification)}
                    ${this.getContentType(notification)}
                    ${timeDifference(+notification.timestamp, false, 'ago')}
                  </span>
                  <span class="target">
                    ${typeof notification.targetContent === 'string' ? html`
                      <span class="failed-read">${toNiceUrl(notification.targetContent)}</span>
                    ` : notification.targetContent ? html`
                      ${this.renderTargetContent(notification.targetContent)}
                    ` : html`
                      <span class="spinner"></span>
                    `}
                  </span>
                </span>
              </a>
            `
          })}
          ${this.notifications.length === 0
            ? html`
              <div class="empty">
                <div><span class="fas fa-image"></span></div>
                <div>
                  This is the notifications feed. It will show notifications from users in your network
                </div>
              </div>
            ` : ''}
        `}
        <beaker-paginator
          page=${this.page}
          label="Showing notifications ${(this.page * PAGE_SIZE$2) + 1} - ${(this.page + 1) * PAGE_SIZE$2}"
          @change-page=${this.onChangePage}
        ></beaker-paginator>
      </div>
    `
      }
      
      renderTargetContent (targetContent) {
        if (targetContent.path.includes('/posts/')) {
          return html`
        <span class="post">
          ${targetContent.stat.metadata.title}
        </span>
      `
        }
        if (targetContent.path.includes('/comments/')) {
          return html`
        <span class="comment">
          ${targetContent.content}
        </span>
      `
        }
      }

      // events
      // =

      onChangePage (e) {
        this.page = e.detail.page;
        this.notifications = undefined;
        this.load();
      }
    }

    customElements.define('beaker-notifications-feed', NotificationsFeed);

    class NotificationsView extends LitElement {
      static get properties () {
        return {
          user: {type: Object}
        }
      }
     
      createRenderRoot () {
        return this // no shadow dom
      }

      constructor () {
        super();
        this.user = undefined;
      }

      async load () {
        await this.requestUpdate();
        // Array.from(this.querySelectorAll('[loadable]'), el => el.load())
        setTimeout(() => {
          markAllRead();
        }, 2e3);
      }

      render () {
        if (!this.user) return html``
        return html`
      <div class="layout right-col">
        <main>
          <beaker-notifications-feed loadable .user=${this.user}></beaker-notifications-feed>
        </main>
        <nav>
          <beaker-post-buttons></beaker-post-buttons>
          <beaker-topics loadable></beaker-topics>
        </nav>
      </div>
    `
      }

      // events
      // =

    }

    customElements.define('beaker-notifications-view', NotificationsView);

    const cssStr$o = css`
${cssStr}
${cssStr$1}

:host {
  display: block;
  padding-right: 10px;
}

beaker-post {
  border-top: 1px solid #dde;
  padding: 16px 10px;
  margin: 0;
}
`;

    const QUERY_PAGE_SIZE = 100;
    const PAGE_SIZE$3 = 25;

    class SearchResults extends LitElement {
      static get properties () {
        return {
          user: {type: Object},
          driveType: {type: String, attribute: 'drive-type'},
          query: {type: String},
          results: {type: Array}
        }
      }

      static get styles () {
        return cssStr$o
      }

      constructor () {
        super();
        this.user = undefined;
        this.driveType = undefined;
        this.query = undefined;
        this.results = undefined;
        this.page = 0;
      }

      async load () {
        var results = await this.runPostsQuery();
        if (this.driveType === 'unwalled.garden/person' && results.length < PAGE_SIZE$3) {
          results = results.concat(await this.runFollowsQuery(results.length));
        }
        /* dont await */ this.loadFeedAnnotations(results);
        this.results = results;
        console.log(this.results);

        await this.requestUpdate();
        Array.from(this.shadowRoot.querySelectorAll('[loadable]'), el => el.load());
      }

      async runPostsQuery () {
        var sliceStart = this.page * PAGE_SIZE$3;
        var sliceEnd = sliceStart + PAGE_SIZE$3;
        var results = [];
        var offset = 0;
        var query = this.query ? this.query.toLowerCase() : undefined;
        while (1) {
          let candidates = await posts.list({
            driveType: this.driveType || undefined,
            offset,
            limit: QUERY_PAGE_SIZE,
            sort: 'name',
            reverse: true
          });
          if (candidates.length === 0) {
            break
          }
          if (query) {
            candidates = candidates.filter(candidate => (
              candidate.stat.metadata.title.toLowerCase().includes(query)
            ));
          }
          results = results.concat(candidates);
          if (results.length >= sliceEnd) break
          offset += QUERY_PAGE_SIZE;
        }
        results = results.slice(sliceStart, sliceEnd);
        await profiles.readAllProfiles(results);
        return results
      }

      async runFollowsQuery (numExistingResults) {
        var sliceStart = this.page * PAGE_SIZE$3 + numExistingResults;
        var sliceEnd = sliceStart + PAGE_SIZE$3 - numExistingResults;
        var query = this.query ? this.query.toLowerCase() : undefined;
        let results = await follows.list(undefined, {includeProfiles: true, removeDuplicateMounts: true});
        if (query) {
          results = results.filter(candidate => (
            candidate.mount.title.toLowerCase().includes(query)
          ));
        }
        results = results.map(r => r.mount).slice(sliceStart, sliceEnd);
        return results
      }

      requestFeedPostsUpdate () {
        Array.from(this.shadowRoot.querySelectorAll('beaker-post'), el => el.requestUpdate());
      }

      async refreshFeed () {
        this.loadFeedAnnotations(this.results);
      }

      async loadFeedAnnotations (results) {
        for (let result of results) {
          if (!isPost(result)) continue
          ;[result.votes, result.numComments] = await Promise.all([
            votes.tabulate(result.url),
            comments.count({href: result.url})
          ]);
          this.requestFeedPostsUpdate();
        }
      }

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="feed">
        ${typeof this.results === 'undefined' ? html`
          <div class="empty">
            <span class="spinner"></span>
          </div>
        ` : html`
          ${repeat(this.results, result => isPost(result) ? html`
            <beaker-post
              .post=${result}
              user-url="${this.user.url}"
            ></beaker-post>
          ` : '')}
          ${this.driveType === 'unwalled.garden/person' ? html`
            <beaker-profile-list loadable .user=${this.user} .profiles=${this.results.filter(isNotPost)}></beaker-profile-list>
          ` : ''}
          ${this.results.length === 0
            ? html`
              <div class="empty">
                <div><span class="fas fa-search"></span></div>
                <div>
                  No results found.
                </div>
              </div>
            ` : ''}
          <beaker-paginator
            page=${this.page}
            label="Showing results ${(this.page * PAGE_SIZE$3) + 1} - ${(this.page + 1) * PAGE_SIZE$3}"
            @change-page=${this.onChangePage}
          ></beaker-paginator>
        `}
      </div>
    `
      }

      // events
      // =

      onChangePage (e) {
        this.page = e.detail.page;
        this.results = undefined;
        this.load();
      }
    }

    customElements.define('beaker-search-results', SearchResults);

    function isPost (result) {
      return result.type === 'file'
    }

    function isNotPost (result) {
      return !isPost(result)
    }

    class SearchView extends LitElement {
      static get properties () {
        return {
          user: {type: Object}
        }
      }
     
      createRenderRoot () {
        return this // no shadow dom
      }

      constructor () {
        super();
        this.user = undefined;
        var qp = new URLSearchParams(location.search);
        this.driveType = qp.get('drive-type') || undefined;
        this.query = qp.get('query') || undefined;
      }

      async load () {
        await this.requestUpdate();
      }

      render () {
        if (!this.user) return html``
        return html`
      <div class="layout right-col">
        <main>
          <h3 style="margin: 0 6px 10px; color: #556">
            <span class="fas fa-fw fa-search"></span>
            ${this.query ? 'Searching for' : 'Listing all'} ${toNiceDriveType(this.driveType) || 'post'}s ${this.query ? `matching "${this.query}"` : ''}
          </h3>
          <beaker-search-results loadable .user=${this.user} drive-type=${this.driveType || ''} query=${this.query || ''}></beaker-search-results>
        </main>
        <nav>
          <beaker-post-buttons></beaker-post-buttons>
          <beaker-topics loadable></beaker-topics>
        </nav>
      </div>
    `
      }

      // events
      // =

    }

    customElements.define('beaker-search-view', SearchView);

    function getParam (k, fallback = '') {
      return (new URL(window.location)).searchParams.get(k) || fallback
    }

    const cssStr$p = css`
${cssStr$f}
${cssStr$1}

:host {
  --input-bg-color: #f1f1f6;
  --input-border-radius: 16px;
  display: block;
  margin-right: 16px;
}

.search-container {
  position: relative;
  height: 36px;
  width: 200px;
  font-size: 13px;
  transition: width .25s;
}

.search-container.active {
  width: 400px;
}

@media (max-width: 1000px) {
  .search-container.active {
    width: 300px;
  }
}

@media (max-width: 900px) {
  .search-container.active {
    width: 200px;
  }
}

.spinner,
.close-btn,
.search {
  position: absolute;
}

input.search {
  background: var(--input-bg-color);
  border-radius: var(--input-border-radius);
  left: 0;
  top: 0;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  padding-left: 32px;
  margin-top: 3px;
  box-sizing: border-box;
  font-size: 13px;
}

input.search::-webkit-input-placeholder {
  font-size: 13px;
}

input:focus {
  box-shadow: none;
}

.search-container > i.fa-search {
  position: absolute;
  left: 12px;
  font-size: 13px;
  top: 13px;
  color: rgba(0,0,0,0.4);
  z-index: 1;
}

.autocomplete-container {
  position: relative;
  width: 100%;
}

.autocomplete-results {
  position: absolute;
  left: 0;
  top: 30px;
  z-index: 5;
  width: 100%;
  margin-bottom: 10px;
  overflow: hidden;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #ddd;
  box-shadow: 0 6px 20px rgba(0,0,0,.05);
}

.autocomplete-result-group {
  margin-bottom: 6px;
}

.autocomplete-result-group-title {
  padding: 4px 10px;
  border-bottom: 1px solid #ddd;
  color: rgba(0,0,0,.5);
}

.autocomplete-result {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  height: 40px;
  padding: 0 10px;
  border-left: 3px solid transparent;
  cursor: pointer;
  color: inherit;
  text-decoration: none;
}

.autocomplete-result .icon {
  width: 24px;
  height: 24px;
  text-align: center;
  margin-right: 10px;
}

.autocomplete-result .icon.rounded {
  border-radius: 50%;
  object-fit: cover;
}

.autocomplete-result .title,
.autocomplete-result .label {
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.autocomplete-result .title {
  margin-right: 5px;
  flex: auto 0;
}

.autocomplete-result .label {
  color: rgba(0,0,0,.475);
  flex: 1;
}

.autocomplete-result:hover {
  background: #f7f7f7;
  border-color: #ddd;
}

.autocomplete-result.active {
  background: rgba(40, 100, 220, 0.07);
  border-color: #2864dc;
}
`;

    class SearchInput extends LitElement {
      static get properties () {
        return {
          placeholder: {type: String},
          isFocused: {type: Boolean},
          query: {type: String},
          highlighted: {type: Number}
        }
      }

      static get styles () {
        return cssStr$p
      }

      constructor () {
        super();
        this.placeholder = '';
        this.isFocused = false;
        this.query = getParam('query', undefined);
        this.results = undefined;
        this.highlighted = 0;

        this.$onClickDocument = this.onClickDocument.bind(this);
      }

      get value () {
        return this.query
      }

      generateResults () {
        const title = (typeLabel) => `${!this.query ? 'List all' : 'Search'} ${typeLabel}${this.query ? ` for "${this.query}"` : ''}`;
        const url = (driveType) => `/search?drive-type=${encodeURIComponent(driveType)}&query=${encodeURIComponent(this.query)}`;
        this.results = [
          {title: title('posts'), url: url('')},
          {title: title('users'), url: url('unwalled.garden/person')},
          {title: title('templates'), url: url('unwalled.garden/template')},
          {title: title('modules'), url: url('unwalled.garden/module')},
          {title: title('webterm commands'), url: url('webterm.sh/cmd-pkg')}
        ];
      }

      // rendering
      // =

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="search-container ${this.isFocused ? 'active' : ''}">
        <i class="fas fa-search"></i>
        <input
          type="text"
          class="search"
          placeholder="${this.placeholder}"
          value="${this.query}"
          @keydown=${this.onKeydownInput}
          @keyup=${this.onKeyupInput}
          @focus=${this.onFocusInput}
        >
        ${this.renderResults()}
      </div>
    `
      }

      renderResults () {
        if (!this.results || !this.isFocused) {
          return ''
        }
        return html`
      <div class="search-results autocomplete-results">
        ${repeat(this.results, (res, i) => this.renderResult(res, i))}
      </div>
    `
      }

      renderResult (res, i) {
        const cls = classMap({
          'autocomplete-result': true,
          'search-result': true,
          active: i === this.highlighted
        });
        return html`
      <a href="${res.url}" class="${cls}" @click=${this.onClickResult}>
        ${''/*<img class="icon favicon" src="beaker-favicon:32,${res.url}"/>*/}
        <span class="title">${res.title}</span>
      </a>
    `
      }

      // events
      // =

      select (url, title) {
        window.location = url;
        // this.shadowRoot.querySelector('input').value = this.query = url
        // this.unfocus()
        // this.dispatchEvent(new CustomEvent('selection-changed', {detail: {title}}))
      }

      unfocus () {
        this.isFocused = false;

        var input = this.shadowRoot.querySelector('input');
        if (input.matches(':focus')) {
          input.blur();
        }

        document.removeEventListener('click', this.$onClickDocument);
      }

      onClickResult (e) {
        e.preventDefault();
        this.select(e.currentTarget.getAttribute('href'), e.currentTarget.getAttribute('title'));
      }

      onKeydownInput (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();

          let res = this.results[this.highlighted];
          if (res) {
            this.select(res.url, res.title);
          }
          return
        }
        if (e.key === 'Escape') {
          return this.unfocus()
        }
        if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
          e.preventDefault();
          this.highlighted = Math.max(this.highlighted - 1, 0);
        }
        if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
          e.preventDefault();
          this.highlighted = Math.min(this.highlighted + 1, this.results.length - 1);
        }
      }

      onKeyupInput (e) {
        if (this.query !== e.currentTarget.value) {
          this.query = e.currentTarget.value;
          this.generateResults();
        }
      }

      onFocusInput (e) {
        this.isFocused = true;
        this.generateResults();
        document.addEventListener('click', this.$onClickDocument);
      }

      onClickDocument (e) {
        // is the click inside us?
        for (let el of e.path) {
          if (el === this) return
        }
        // no, unfocus
        this.unfocus();
      }
    }

    customElements.define('beaker-search-input', SearchInput);

    const NOTIFICATIONS_INTERVAL = 15e3;

    const ROUTES = {
      'home': /^\/(index.html)?$/i,
      'compose': /^\/compose$/i,
      'comments': /^\/comments$/i,
      'notifications': /^\/notifications$/i,
      'search': /^\/search$/i,
      'userProfile': /^\/(?<id>[^\/]+)$/i,
      'userPosts': /^\/(?<id>[^\/]+)\/posts$/i,
      'userComments': /^\/(?<id>[^\/]+)\/comments$/i,
      'userFollowers': /^\/(?<id>[^\/]+)\/followers$/i,
      'userFollowing': /^\/(?<id>[^\/]+)\/following$/i,
      'post': /^\/(?<id>[^\/]+)\/posts\/(?<topic>[^\/]+)\/(?<filename>[^\/]+)$/i,
      'comment': /^\/(?<id>[^\/]+)\/comments\/(?<filename>[^\/]+)$/i
    };

    window.tutil = tutil;
    init();

    class App extends LitElement {
      static get properties () {
        return {
          currentView: {type: String},
          user: {type: Object}
        }
      }

      static get styles () {
        return cssStr$3
      }

      constructor () {
        super();
        this.route = '404';
        this.routeParams = undefined;
        this.user = undefined;
        this.notificationCount = undefined;
        this.load();
      }

      async load () {
        for (let route in ROUTES) {
          let match = ROUTES[route].exec(window.location.pathname);
          if (match) {
            this.route = route;
            this.routeParams = match;
            break
          }
        }
        console.log(this.route, this.routeParams);

        if (this.route === 'comment') {
          this.doCommentRedirect();
        }

        if (!this.user) {
          let st = await navigator.filesystem.stat('/profile');
          this.user = await (new Hyperdrive(st.mount.key)).getInfo();
          profiles.setUser(this.user);
          await profiles.readSocialGraph(this.user, this.user);
        }
        await this.requestUpdate();
        Array.from(this.shadowRoot.querySelectorAll('[loadable]'), el => el.load());

        this.notificationCount = await count({isUnread: true});
        await this.requestUpdate();
        events.addEventListener('new-events', e => {
          this.notificationCount += e.detail.numNewEvents;
          this.requestUpdate();
        });
        setTimeout(this.checkNotifications.bind(this), 5e3);
      }

      async checkNotifications () {
        await updateIndex(this.user.url);
        setTimeout(this.checkNotifications.bind(this), NOTIFICATIONS_INTERVAL);
      }

      async doCommentRedirect () {
        try {
          var comment = await comments.get(this.routeParams.groups.id, `/comments/${this.routeParams.groups.filename}`);
          var urlp = new URL(comment.stat.metadata.href);
          window.location = `/${urlp.hostname}${urlp.pathname}`;
        } catch (e) {
          console.error('Failed to load comment', e);
        }
      }

      // rendering
      // =

      render () {
        return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <header>
        <a class="brand" href="/">
          <img class="logo" src="/img/logo-16x16.png">
          <strong>Beaker.Network</a></strong>
        </a>
        <a href="/" title="Posts">Posts</a>
        <a href="/comments" title="Comments">Comments</a>
        <span class="spacer"></span>
        <beaker-search-input placeholder="Search your network"></beaker-search-input>
        <a
          class=${classMap({highlighted: this.notificationCount > 0 })}
          href="/notifications"
          title="${this.notificationCount || 'No'} ${pluralize(this.notificationCount || 0, 'notification')}"
          data-tooltip="${this.notificationCount || 'No'} ${pluralize(this.notificationCount || 0, 'notification')}"
        >
          <span class="fas fa-fw fa-bell"></span>
          ${typeof this.notificationCount === 'undefined' ? html`<span class="spinner"></span>` : this.notificationCount}
        </a>
        ${this.user && this.user.following ? html`
          <a
            href="/${this.user.url.slice('hd://'.length)}/following"
            title="Following ${this.user.following.length} ${pluralize(this.user.following.length, 'user')}"
            data-tooltip="Following ${this.user.following.length} ${pluralize(this.user.following.length, 'user')}"
          >
            <span class="fas fa-fw fa-users"></span>
            ${this.user.following.length}
          </a>
        ` : ''}
        ${this.user ? html`
          <a href="/${this.user.url.slice('hd://'.length)}">
            <span class="fas fa-fw fa-user-circle"></span>
            ${this.user.title}
          </a>
        ` : ''}
      </header>
      ${this.renderView()}
    `
      }

      renderView () {
        switch (this.route) {
          case 'home': return html`
        <beaker-posts-view loadable .user=${this.user}></beaker-posts-view>
      `
          case 'compose': return html`
        <beaker-compose-view loadable .user=${this.user}></beaker-compose-view>
      `
          case 'comments': return html`
        <beaker-comments-view loadable .user=${this.user}></beaker-comments-view>
      `
          case 'notifications': return html`
        <beaker-notifications-view loadable .user=${this.user}></beaker-notifications-view>
      `
          case 'search': return html`
        <beaker-search-view loadable .user=${this.user}></beaker-search-view>
      `
          case 'userProfile':
          case 'userPosts': return html`
        <beaker-profile-view loadable .user=${this.user} profile-id=${this.routeParams.groups.id}></beaker-profile-view>
      `
          case 'userComments': return html`
        <beaker-profile-view loadable .user=${this.user} profile-id=${this.routeParams.groups.id} subview="comments"></beaker-profile-view>
      `
          case 'userFollowing': return html`
        <beaker-profile-view loadable .user=${this.user} profile-id=${this.routeParams.groups.id} subview="following"></beaker-profile-view>
      `
          case 'userFollowers': return html`
        <beaker-profile-view loadable .user=${this.user} profile-id=${this.routeParams.groups.id} subview="followers"></beaker-profile-view>
      `
          case 'post': return html`
        <beaker-post-view
          loadable
          .user=${this.user}
          author=${this.routeParams.groups.id}
          topic=${this.routeParams.groups.topic}
          filename=${this.routeParams.groups.filename}
        ></beaker-post-view>
      `
          case '404': return html`<div class="layout"><main><h1>404 not found</h1></main></div>`
        }
      }

      // events
      // =
    }

    customElements.define('app-main', App);

    exports.App = App;

    return exports;

}({}));
