// ==UserScript==
// @name          Wekan auto flex list
// @description   Set Wekan lists' flexboxes to "auto" to make width fully responsive
// @namespace     https://github.com/rgalonso
// @downloadURL   https://github.com/rgalonso/tampermonkey_scripts/raw/master/wekan_auto_flex_lists.user.js
// @version       1.0
// @author        Robert Alonso
// @grant         none
// @run-at        context-menu
// ==/UserScript==


function modifyStyleOfElementsOfClass(class_name, css) {
    // get all elements for which the given class is applied
    var elems = document.getElementsByClassName(class_name);
    if (!elems) { return; }
    // for each element, add/modify the style as specified
    Array.prototype.slice.call(elems).forEach(function(x) {
        eval('x.style.' + css)
    })
}

// modify all "list" class elements such that flexbox auto-scales
// (as opposed to having a fixed width of 270px, as seen in several
//  versions, including the current version as of 2019/02/07)
modifyStyleOfElementsOfClass('list', 'flex = "auto"');
