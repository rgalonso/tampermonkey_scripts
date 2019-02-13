// ==UserScript==
// @name          Resizable divs
// @description   Makes divs with a specific CSS class name resizable.  Ideal for tabular layouts, especially Wekan.
// @namespace     https://github.com/rgalonso
// @downloadURL   https://github.com/rgalonso/tampermonkey_scripts/raw/master/resizable_divs.user.js
// @version       1.3
// @author        Robert Alonso
// @match         http*://*/*
// @grant         none
// @run-at        document-idle
// ==/UserScript==

function addGlobalStyle(css) {
    var head, style;
    head = document.getElementsByTagName('head')[0];
    if (!head) { return; }
    style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    head.appendChild(style);
}

addGlobalStyle(`
.resizable {
  position: relative;

  /* "break-word" overflow behavior doesn't work as expected with flexboxes unless min-width is set to 0 */
  min-width: 0;
  overflow-wrap: break-word;
}

.resizable .resizer-handle{
  height: 20%;
  border-radius: 100%;
  background: white;
  border: 2px solid #4286f4;
  position: absolute;
  right: 0px;
  cursor: ew-resize;
}

.resizable .resizer-handle.all{
  top: 0%;
}

.resizable .resizer-handle.column{
  top: 38%;
}

.resizable .resizer-handle.individual{
  top: 75%;
}

/* Tooltip container */
.tooltip {
  position: relative;
  display: inline-block;
  border-bottom: 1px dotted black; /* If you want dots under the hoverable text */
}

/* Tooltip text */
.tooltip .tooltiptext {
  visibility: hidden;
  width: 120px;
  background-color: black;
  color: #fff;
  text-align: center;
  padding: 5px 0;
  border-radius: 6px;

  /* Position the tooltip text - see examples below! */
  position: absolute;
  z-index: 1;
}

/* Show the tooltip text when you mouse over the tooltip container */
.tooltip:hover .tooltiptext {
  visibility: visible;
  transition-delay:1s;
}
` );

function addStyleAndResizersToElementsOfClass(class_name, new_classes, add_resizers = true) {
    var elems = document.getElementsByClassName(class_name);
    if (!elems) { return; }

    addStyleAndResizersToElements(elems, new_classes, add_resizers)
}

/*
 * Synchronized resizable divs
 *
 *
 * Finds all elements of class name "resizable" and adds mouse and touch event listeners
 * to their corresponding "resizer-handle"class elements such that the "resizable" can
 * be resized.
 *
 * There are three types of "resizer-handle" classes:
 *   resizer-handle all:        Resizing using these handles causes all "resizable"
 *                              elements to adjust to the new same width.
 *                              Double-clicking/tapping causes all resizable elements to
 *                              assume the same width as the clicked element.
 *   resizer-handle column:     Resizing using these handles causes all "resizable"
 *                              elements of the same column to adjust to the new same width.
 *                              Double-clicking/tapping causes all resizable elements of the
 *                              column to assume the same width as the clicked element.
 *   resizer-handle individual: Resizing using these handles causes only the corresponding
 *                              "resizable" element to adjust to the new width.
 *                              Double-clicking/tapping causes all resizable elements to
 *                              adjust to the same width such that they all fit on the screen.
 *
 * Author: Robert Alonso
 *
 */

const MINIMUM_SIZE = 20;
var all_resizable_divs;
var previous_x = 0;
var active_element = null

var DoubleTapAction = {
  MATCH_ALL: 0,
  MATCH_COLUMN: 1,
  FIT_ALL: 2
}

function addStyleAndResizersToElements(elems, new_classes = null, add_resizers = true) {
    Array.prototype.slice.call(elems).forEach(function(x) {
        if (new_classes) {
          new_classes.split(' ').forEach(function (new_class) {
              x.classList.add(new_class)
          })
        }

        if (add_resizers) {
          [['all', 'Adjust width of all elements.  Double-click/tap to set all elements to width of this element.'],
           ['column', 'Adjust width of all elements of this column.  Double-click/tap to set all elements of this column to width of this element.'],
           ['individual', 'Adjust width of this element.  Double-click/tap to evenly fit all elements on the screen.']].forEach(function(resizer_details) {
            var resizer = document.createElement('div')
            var tooltip = document.createElement('span')
            resizer.classList.add('resizer-handle', resizer_details[0], 'tooltip')
            tooltip.classList.add('tooltiptext')
            tooltip.innerHTML = resizer_details[1]
            resizer.appendChild(tooltip)
            x.appendChild(resizer)
          })
        }
      })
    }

/* Handle mouse doubleclick or touch doubletap */
var latest_tap;

function getEvenlyResizedWidth() {
    var total_resizable_width = 0
    var num_resizable_children = 0
    var evenly_resized_width = 0

    try {
        total_resizable_width = document.getElementsByClassName('board-canvas')[0].offsetWidth

        Array.prototype.slice.call(document.getElementsByClassName('swimlane js-swimlane')[0].children).forEach(function(child) {
            if (child.classList.contains('resizable')) {
                num_resizable_children++
            }
            else {
                total_resizable_width -= child.offsetWidth
            }
        })
    }
    catch (e) {}

    if (num_resizable_children > 0) {
        evenly_resized_width = total_resizable_width / num_resizable_children
    }

    return evenly_resized_width
}

function doubletap(double_tap_action, force = false, e = null) {
  var now = new Date().getTime();
  var timesince = now - latest_tap;

  // if two mousedown/touchstart events occur within a short period, assume it's a doubletap
  if (force || ((timesince < 600) && (timesince > 0))) {
    window.removeEventListener('resize', forceFitAll)

    switch (double_tap_action) {
      case DoubleTapAction.MATCH_ALL:
        // resize all elements such that they have the same width as the reference element
        doResize(all_resizable_divs, active_element.getBoundingClientRect().width)
        break;
      case DoubleTapAction.MATCH_COLUMN:
        doResize(all_resizable_divs, active_element.getBoundingClientRect().width, false)
        break;
      case DoubleTapAction.FIT_ALL:
        // resize all elements such that they all fit on the screen with the same width
        var resized_width = getEvenlyResizedWidth()

        if (resized_width == 0) {
            // (re)apply styles, etc.
            executeOnDocument()

            // try again
            resized_width = getEvenlyResizedWidth()
        }

        if (resized_width > 0) {
            doResize(all_resizable_divs, resized_width)
            window.addEventListener('resize', forceFitAll)
        }
        else {
          console.log('FIT_ALL DoubleTapAction not supported for this page')
        }
        break;
      default:
        console.warn('Unhandled DoubleTapAction value ' + double_tap_action)
    }
  }

  latest_tap = now;
}

function forceFitAll(e) {
    doubletap(DoubleTapAction.FIT_ALL, true)
}

/* get the X position associated with either a mouse or touch event */
function getPageX(e) {
  var pageX = e.pageX
  if (!pageX) {
    pageX = e.changedTouches[0].pageX
  }
  return pageX
}

function updateResizableEventHandlers() {
  var resizer_handles;

  // register mouse and touch event listeners for the "all" resizer-handlers
  resizer_handles = document.getElementsByClassName('resizer-handle all')
  for (let i = 0; i < resizer_handles.length; i++) {
    resizer_handles[i].addEventListener('mousedown', startResizeTemplate('mousemove', resizeAll, 'mouseup', stopResize, DoubleTapAction.MATCH_ALL))
    resizer_handles[i].addEventListener('touchstart', startResizeTemplate('touchmove', resizeAll, 'touchend', stopResize, DoubleTapAction.MATCH_ALL))
  }

  // register mouse and touch event listeners for the "column" resizer-handlers
  resizer_handles = document.getElementsByClassName('resizer-handle column')
  for (let i = 0; i < resizer_handles.length; i++) {
    resizer_handles[i].addEventListener('mousedown', startResizeTemplate('mousemove', resizeColumn, 'mouseup', stopResize, DoubleTapAction.MATCH_COLUMN))
    resizer_handles[i].addEventListener('touchstart', startResizeTemplate('touchmove', resizeColumn, 'touchend', stopResize, DoubleTapAction.MATCH_COLUMN))
  }

  // register mouse and touch event listeners for the "individual" resizer-handlers
  resizer_handles = document.getElementsByClassName('resizer-handle individual')
  for (let i = 0; i < resizer_handles.length; i++) {
    resizer_handles[i].addEventListener('mousedown', startResizeTemplate('mousemove', resizeIndividual, 'mouseup', stopResize, DoubleTapAction.FIT_ALL))
    resizer_handles[i].addEventListener('touchstart', startResizeTemplate('touchmove', resizeIndividual, 'touchend', stopResize, DoubleTapAction.FIT_ALL))
  }
}

/* template function that returns a function that serves as an
   event handler for the "start resizing" event */
function startResizeTemplate(move_event_type, move_event_handler,
  end_event_type, end_event_handler, double_tap_action) {
  return (function(e) {
    e.preventDefault()
    previous_x = getPageX(e)
    active_element = e.target.parentNode
    doubletap(double_tap_action, false, e)
    window.addEventListener(move_event_type, move_event_handler)
    window.addEventListener(end_event_type, end_event_handler)
  })
}

/* Perform resizing operation for the given set of elements */
function doResize(resizable_elements, width, iterate_all = true) {
  var apply_change;

  // resize all elements in the same column such that they have the same width as the reference element
  var filtered_set = []

  if (width > MINIMUM_SIZE) {
    if (!iterate_all) {
      try {
        // specialization for Wekan
        var swimlanes = Array.prototype.slice.call(document.getElementsByClassName('swimlane js-swimlane'))
        var col = null

        //find the column matching the reference element
        for (let i = 0;
          (col == null) && (i < swimlanes.length); i++) {
          for (let j = 0;
            (col == null) && (j < swimlanes[i].children.length); j++) {
            if (active_element == swimlanes[i].children[j]) {
              col = j
            }
          }
        }

        //find all elements in the same column
        swimlanes.forEach(function(swimlane) {
          for (let j = 0; j < swimlane.children.length; j++) {
            if (j == col) {
              filtered_set.push(swimlane.children[j])
            }
          }
        })
      } catch (e) {}
    }

    Array.prototype.slice.call(resizable_elements).forEach(function(x) {
      apply_change = false

      if (iterate_all) {
        apply_change = true
      } else if (filtered_set.length > 0) {
        apply_change = filtered_set.includes(x)
      } else if (Math.abs(active_element.getBoundingClientRect().left - x.getBoundingClientRect().left) <= 1) {
        apply_change = true
      }

      if (apply_change) {
        x.style.setProperty('flex', '0 0 ' + width.toString() + 'px')
      }
    })
  }
}

/* template function that returns a function that serves as an
   event handler for the "continue resizing" event */
function resizeTemplate(resizable_elements, iterate_all = true) {
  return (function(e) {
    var pageX = getPageX(e)
    const width = active_element.getBoundingClientRect().width + (pageX - previous_x)
    previous_x = pageX
    window.removeEventListener('resize', forceFitAll)
    doResize(resizable_elements, width, iterate_all)
  })
}

function resizeAll(e) {
  resizeTemplate(all_resizable_divs)(e)
}

function resizeColumn(e) {
  resizeTemplate(all_resizable_divs, false)(e)
}

function resizeIndividual(e) {
  resizeTemplate([active_element])(e)
}

function stopResize() {
  window.removeEventListener('mousemove', resizeAll)
  window.removeEventListener('mousemove', resizeColumn)
  window.removeEventListener('mousemove', resizeIndividual)
  window.removeEventListener('touchmove', resizeAll)
  window.removeEventListener('touchmove', resizeColumn)
  window.removeEventListener('touchmove', resizeIndividual)
  active_element = null
}

function update() {
    // add style and resizer handles to specified elements
    addStyleAndResizersToElementsOfClass('list js-list', 'resizable');
    addStyleAndResizersToElementsOfClass('list js-list-composer', 'resizable', false);

    // update list of all resizable divs
    all_resizable_divs = document.getElementsByClassName('resizable');

    // install event handlers
    updateResizableEventHandlers()
}

function clickTapHandler(e) {
    // This isn't ideal because this is a fair amount of activity that happens on every click/tap,
    // usually unnecessarily.  But until this is integrated into Wekan directly, this is very useful
    // for dynamically supporting new lists and swimlanes being added.
    // Click/tap once to add resizer handles to all new lists/swimlanes.  Doubleclick/tap to auto-
    // resize all lists.
    update()
    forceFitAll()
    window.removeEventListener('click', clickTapHandler)
}

// userscript "@match" directive is hard to specify generically for Wekan because it's just another
// Sandstorm component in an iframe, but looking at the referrer URL can help us figure it out
if (document.referrer.match('[a-z]*://[^:/]+[:0-9]*/grain.*/sandstorm/libreboard$')) {
    window.addEventListener('click', clickTapHandler)
}
