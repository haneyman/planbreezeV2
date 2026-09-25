/*
 * PlanBreeze design preview runtime (local, standalone).
 *
 * Lets the .dc.html design files in this folder open directly in a browser
 * without the Claude design canvas. It implements the small template subset
 * these files use: {{holes}}, <sc-for>, <sc-if>, <helmet>, event attributes
 * (onClick / onChange) and a React-like DCLogic class with setState.
 *
 * This is a review tool only — it is NOT the production app.
 */
(function () {
  'use strict';

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
      this.state = Object.assign({}, this.state, next);
      scheduleRender();
    }
    forceUpdate() { scheduleRender(); }
    renderVals() { return {}; }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  let template = null;
  let mount = null;
  let instance = null;
  let pending = false;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    let cur = scope;
    for (const part of path.split('.')) {
      if (cur == null) return undefined;
      cur = cur[part];
    }
    return cur;
  }

  function interpolate(str, scope) {
    return str.replace(HOLE, (_, p) => {
      const v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }

  function attrRaw(el, name, scope) {
    const v = el.getAttribute(name);
    if (v == null) return undefined;
    const m = v.match(WHOLE);
    return m ? lookup(m[1], scope) : v;
  }

  function renderChildren(src, scope, parent) {
    src.childNodes.forEach((n) => renderNode(n, scope, parent));
  }

  function renderNode(node, scope, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(interpolate(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName;

    if (tag === 'sc-for') {
      const list = attrRaw(node, 'list', scope) || [];
      const as = node.getAttribute('as') || 'item';
      Array.from(list).forEach((item, i) => {
        const child = Object.create(scope);
        child[as] = item;
        child.$index = i;
        renderChildren(node, child, parent);
      });
      return;
    }
    if (tag === 'sc-if') {
      if (attrRaw(node, 'value', scope)) renderChildren(node, scope, parent);
      return;
    }

    const el = node.cloneNode(false);
    Array.from(node.attributes).forEach((a) => {
      const name = a.name;
      if (name.startsWith('hint-')) { el.removeAttribute(name); return; }
      if (!a.value.includes('{{')) return;
      const whole = a.value.match(WHOLE);
      const raw = whole ? lookup(whole[1], scope) : interpolate(a.value, scope);
      if (name.startsWith('on')) {
        el.removeAttribute(name);
        if (typeof raw === 'function') el.addEventListener(name.slice(2), raw);
        return;
      }
      if (name === 'checked' || name === 'disabled' || name === 'selected') {
        el.removeAttribute(name);
        el[name] = !!raw;
        return;
      }
      if (raw === false || raw == null) { el.removeAttribute(name); return; }
      el.setAttribute(name, String(raw));
    });
    renderChildren(node.content || node, scope, el);
    parent.appendChild(el);
  }

  function render() {
    pending = false;
    const vals = instance ? instance.renderVals() : {};
    const frag = document.createDocumentFragment();
    renderChildren(template, vals, frag);
    mount.replaceChildren(frag);
  }

  function scheduleRender() {
    if (pending || !template) return;
    pending = true;
    requestAnimationFrame(render);
  }

  function boot() {
    const xdc = document.querySelector('x-dc');
    if (!xdc) return;

    // Move <helmet> contents (fonts, page styles) into <head>.
    const helmet = xdc.querySelector('helmet');
    if (helmet) {
      Array.from(helmet.children).forEach((c) => document.head.appendChild(c));
      helmet.remove();
    }

    // Keep the markup as an inert template, then render into a mount point.
    template = document.createElement('div');
    while (xdc.firstChild) template.appendChild(xdc.firstChild);
    mount = document.createElement('div');
    xdc.replaceWith(mount);

    const script = document.querySelector('script[data-dc-script]');
    let props = {};
    if (script) {
      try {
        const decl = JSON.parse(script.getAttribute('data-props') || '{}');
        Object.keys(decl).forEach((k) => {
          if (k !== '$preview' && decl[k] && 'default' in decl[k]) props[k] = decl[k].default;
        });
      } catch (e) { /* ignore */ }
      try {
        const Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
        instance = new Component(props);
      } catch (e) {
        console.error('PlanBreeze preview: could not start component', e);
      }
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
