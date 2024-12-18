/**
 * @license
 * Copyright 2016 Massachusetts Institute of Technology
 * All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A div that floats on top of the workspace, for drop-down menus.
 *
 * @class
 */
// Former goog.module ID: Blockly.dropDownDiv

import type {BlockSvg} from './block_svg.js';
import * as common from './common.js';
import type {Field} from './field.js';
import * as dom from './utils/dom.js';
import * as math from './utils/math.js';
import {Rect} from './utils/rect.js';
import type {Size} from './utils/size.js';
import * as style from './utils/style.js';
import type {WorkspaceSvg} from './workspace_svg.js';

/**
 * Arrow size in px. Should match the value in CSS
 * (need to position pre-render).
 */
export const ARROW_SIZE = 16;

/**
 * Drop-down border size in px. Should match the value in CSS (need to position
 * the arrow).
 */
export const BORDER_SIZE = 1;

/**
 * Amount the arrow must be kept away from the edges of the main drop-down div,
 * in px.
 */
export const ARROW_HORIZONTAL_PADDING = 12;

/** Amount drop-downs should be padded away from the source, in px. */
export const PADDING_Y = 16;

/** Length of animations in seconds. */
export const ANIMATION_TIME = 0.25;

/**
 * Dropdown bounds info object used to encapsulate sizing information about a
 * bounding element (bounding box and width/height).
 */
export interface BoundsInfo {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

/** Dropdown position metrics. */
export interface PositionMetrics {
  initialX: number;
  initialY: number;
  finalX: number;
  finalY: number;
  arrowX: number | null;
  arrowY: number | null;
  arrowAtTop: boolean | null;
  arrowVisible: boolean;
}

export class DropDownDiv {
  /**
   * Timer for animation out, to be cleared if we need to immediately hide
   * without disrupting new shows.
   */
  private animateOutTimer: ReturnType<typeof setTimeout> | null = null;

  /** Callback for when the drop-down is hidden. */
  private onHide: (() => void) | null = null;

  /** A class name representing the current owner's workspace renderer. */
  private renderedClassName = '';

  /** A class name representing the current owner's workspace theme. */
  private themeClassName = '';

  /** The content element. */
  private div: HTMLDivElement;

  /** The content element. */
  private content: HTMLDivElement;

  /** The arrow element. */
  private arrow: HTMLDivElement;

  /**
   * Drop-downs will appear within the bounds of this element if possible.
   * Set in setBoundsElement.
   */
  private boundsElement: Element | null = null;

  /** The object currently using the drop-down. */
  private owner: Field | null = null;

  /** Whether the dropdown was positioned to a field or the source block. */
  private positionToField: boolean | null = null;

  constructor(
    div: HTMLDivElement,
    content: HTMLDivElement,
    arrow: HTMLDivElement
  ) {
    this.div = div;
    this.content = content;
    this.arrow = arrow;
  }

  public static createDropDownDiv(): DropDownDiv {
    const div = document.createElement('div');
    div.className = 'blocklyDropDownDiv';
    const parentDiv = common.getParentContainer() || document.body;
    parentDiv.appendChild(div);

    const content = document.createElement('div');
    content.className = 'blocklyDropDownContent';
    div.appendChild(content);

    const arrow = document.createElement('div');
    arrow.className = 'blocklyDropDownArrow';
    div.appendChild(arrow);

    div.style.opacity = '0';
    // Transition animation for transform: translate() and opacity.
    div.style.transition =
      'transform ' + ANIMATION_TIME + 's, ' + 'opacity ' + ANIMATION_TIME + 's';

    // Handle focusin/out events to add a visual indicator when
    // a child is focused or blurred.
    div.addEventListener('focusin', function () {
      dom.addClass(div, 'blocklyFocused');
    });
    div.addEventListener('focusout', function () {
      dom.removeClass(div, 'blocklyFocused');
    });

    return new DropDownDiv(div, content, arrow);
  }

  /**
   * Set an element to maintain bounds within. Drop-downs will appear
   * within the box of this element if possible.
   *
   * @param boundsElem Element to bind drop-down to.
   */
  public setBoundsElement(boundsElem: Element | null) {
    this.boundsElement = boundsElem;
  }

  /**
   * @returns The field that currently owns this, or null.
   */
  public getOwner(): Field | null {
    return this.owner;
  }

  /**
   * Provide the div for inserting content into the drop-down.
   *
   * @returns Div to populate with content.
   */
  public getContentDiv(): Element {
    return this.content as Element;
  }

  /** Clear the content of the drop-down. */
  public clearContent() {
    this.content.textContent = '';
    this.content.style.width = '';
  }

  /**
   * Set the colour for the drop-down.
   *
   * @param backgroundColour Any CSS colour for the background.
   * @param borderColour Any CSS colour for the border.
   */
  public setColour(backgroundColour: string, borderColour: string) {
    this.div.style.backgroundColor = backgroundColour;
    this.div.style.borderColor = borderColour;
  }

  /**
   * Shortcut to show and place the drop-down with positioning determined
   * by a particular field. The primary position will be below the field,
   * and the secondary position above the field. Drop-down will be
   * constrained to the block's workspace.
   *
   * @param field The field to position the dropdown against.
   * @param opt_onHide Optional callback for when the drop-down is hidden.
   * @param opt_secondaryYOffset Optional Y offset for above-block positioning.
   * @returns True if the menu rendered below block; false if above.
   */
  public showPositionedByField<T>(
    field: Field<T>,
    opt_onHide?: () => void,
    opt_secondaryYOffset?: number,
  ): boolean {
    this.positionToField = true;
    return this.showPositionedByRect(
      this.getScaledBboxOfField(field as Field),
      field as Field,
      opt_onHide,
      opt_secondaryYOffset,
    );
  }

  /**
   * Get the scaled bounding box of a block.
   *
   * @param block The block.
   * @returns The scaled bounding box of the block.
   */
  private getScaledBboxOfBlock(block: BlockSvg): Rect {
    const blockSvg = block.getSvgRoot();
    const scale = block.workspace.scale;
    const scaledHeight = block.height * scale;
    const scaledWidth = block.width * scale;
    const xy = style.getPageOffset(blockSvg);
    return new Rect(xy.y, xy.y + scaledHeight, xy.x, xy.x + scaledWidth);
  }

  /**
   * Get the scaled bounding box of a field.
   *
   * @param field The field.
   * @returns The scaled bounding box of the field.
   */
  private getScaledBboxOfField(field: Field): Rect {
    const bBox = field.getScaledBBox();
    return new Rect(bBox.top, bBox.bottom, bBox.left, bBox.right);
  }

  /**
   * Helper method to show and place the drop-down with positioning determined
   * by a scaled bounding box.  The primary position will be below the rect,
   * and the secondary position above the rect. Drop-down will be constrained to
   * the block's workspace.
   *
   * @param bBox The scaled bounding box.
   * @param field The field to position the dropdown against.
   * @param opt_onHide Optional callback for when the drop-down is hidden.
   * @param opt_secondaryYOffset Optional Y offset for above-block positioning.
   * @returns True if the menu rendered below block; false if above.
   */
  private showPositionedByRect(
    bBox: Rect,
    field: Field,
    opt_onHide?: () => void,
    opt_secondaryYOffset?: number,
  ): boolean {
    // If we can fit it, render below the block.
    const primaryX = bBox.left + (bBox.right - bBox.left) / 2;
    const primaryY = bBox.bottom;
    // If we can't fit it, render above the entire parent block.
    const secondaryX = primaryX;
    let secondaryY = bBox.top;
    if (opt_secondaryYOffset) {
      secondaryY += opt_secondaryYOffset;
    }
    const sourceBlock = field.getSourceBlock() as BlockSvg;
    // Set bounds to main workspace; show the drop-down.
    let workspace = sourceBlock.workspace;
    while (workspace.options.parentWorkspace) {
      workspace = workspace.options.parentWorkspace;
    }
    this.setBoundsElement(workspace.getParentSvg().parentNode as Element | null);
    return this.show(
      field,
      sourceBlock.RTL,
      primaryX,
      primaryY,
      secondaryX,
      secondaryY,
      opt_onHide,
    );
  }

  /**
   * Show and place the drop-down.
   * The drop-down is placed with an absolute "origin point" (x, y) - i.e.,
   * the arrow will point at this origin and box will positioned below or above
   * it.  If we can maintain the container bounds at the primary point, the arrow
   * will point there, and the container will be positioned below it.
   * If we can't maintain the container bounds at the primary point, fall-back to
   * the secondary point and position above.
   *
   * @param newOwner The object showing the drop-down
   * @param rtl Right-to-left (true) or left-to-right (false).
   * @param primaryX Desired origin point x, in absolute px.
   * @param primaryY Desired origin point y, in absolute px.
   * @param secondaryX Secondary/alternative origin point x, in absolute px.
   * @param secondaryY Secondary/alternative origin point y, in absolute px.
   * @param opt_onHide Optional callback for when the drop-down is hidden.
   * @returns True if the menu rendered at the primary origin point.
   * @internal
   */
  public show<T>(
    newOwner: Field<T>,
    rtl: boolean,
    primaryX: number,
    primaryY: number,
    secondaryX: number,
    secondaryY: number,
    opt_onHide?: () => void,
  ): boolean {
    this.owner = newOwner as Field;
    this.onHide = opt_onHide || null;
    // Set direction.
    this.div.style.direction = rtl ? 'rtl' : 'ltr';

    const mainWorkspace = common.getMainWorkspace() as WorkspaceSvg;
    this.renderedClassName = mainWorkspace.getRenderer().getClassName();
    this.themeClassName = mainWorkspace.getTheme().getClassName();
    if (this.renderedClassName) {
      dom.addClass(this.div, this.renderedClassName);
    }
    if (this.themeClassName) {
      dom.addClass(this.div, this.themeClassName);
    }

    // When we change `translate` multiple times in close succession,
    // Chrome may choose to wait and apply them all at once.
    // Since we want the translation to initial X, Y to be immediate,
    // and the translation to final X, Y to be animated,
    // we saw problems where both would be applied after animation was turned on,
    // making the dropdown appear to fly in from (0, 0).
    // Using both `left`, `top` for the initial translation and then `translate`
    // for the animated transition to final X, Y is a workaround.
    return this.positionInternal(primaryX, primaryY, secondaryX, secondaryY);
  }

  /**
   * Get sizing info about the bounding element.
   *
   * @returns An object containing size information about the bounding element
   *     (bounding box and width/height).
   */
  private getBoundsInfo(): BoundsInfo {
    const boundPosition = style.getPageOffset(this.boundsElement as Element);
    const boundSize = style.getSize(this.boundsElement as Element);

    return {
      left: boundPosition.x,
      right: boundPosition.x + boundSize.width,
      top: boundPosition.y,
      bottom: boundPosition.y + boundSize.height,
      width: boundSize.width,
      height: boundSize.height,
    };
  }

  /**
   * Helper to position the drop-down and the arrow, maintaining bounds.
   * See explanation of origin points in show.
   *
   * @param primaryX Desired origin point x, in absolute px.
   * @param primaryY Desired origin point y, in absolute px.
   * @param secondaryX Secondary/alternative origin point x, in absolute px.
   * @param secondaryY Secondary/alternative origin point y, in absolute px.
   * @returns Various final metrics, including rendered positions for drop-down
   *     and arrow.
   */
  private getPositionMetrics(primaryX: number, primaryY: number, secondaryX: number, secondaryY: number): PositionMetrics {
    const boundsInfo = this.getBoundsInfo();
    const divSize = style.getSize(this.div as Element);

    // Can we fit in-bounds below the target?
    if (primaryY + divSize.height < boundsInfo.bottom) {
      return this.getPositionBelowMetrics(primaryX, primaryY, boundsInfo, divSize);
    }
    // Can we fit in-bounds above the target?
    if (secondaryY - divSize.height > boundsInfo.top) {
      return this.getPositionAboveMetrics(
        secondaryX,
        secondaryY,
        boundsInfo,
        divSize,
      );
    }
    // Can we fit outside the workspace bounds (but inside the window)
    // below?
    if (primaryY + divSize.height < document.documentElement.clientHeight) {
      return this.getPositionBelowMetrics(primaryX, primaryY, boundsInfo, divSize);
    }
    // Can we fit outside the workspace bounds (but inside the window)
    // above?
    if (secondaryY - divSize.height > document.documentElement.clientTop) {
      return this.getPositionAboveMetrics(
        secondaryX,
        secondaryY,
        boundsInfo,
        divSize,
      );
    }

    // Last resort, render at top of page.
    return this.getPositionTopOfPageMetrics(primaryX, boundsInfo, divSize);
  }

  /**
   * Get the metrics for positioning the div below the source.
   *
   * @param primaryX Desired origin point x, in absolute px.
   * @param primaryY Desired origin point y, in absolute px.
   * @param boundsInfo An object containing size information about the bounding
   *     element (bounding box and width/height).
   * @param divSize An object containing information about the size of the
   *     DropDownDiv (width & height).
   * @returns Various final metrics, including rendered positions for drop-down
   *     and arrow.
   */
  private getPositionBelowMetrics(
    primaryX: number,
    primaryY: number,
    boundsInfo: BoundsInfo,
    divSize: Size,
  ): PositionMetrics {
    const xCoords = this.getPositionX(
      primaryX,
      boundsInfo.left,
      boundsInfo.right,
      divSize.width,
    );

    const arrowY = -(ARROW_SIZE / 2 + BORDER_SIZE);
    const finalY = primaryY + PADDING_Y;

    return {
      initialX: xCoords.divX,
      initialY: primaryY,
      finalX: xCoords.divX, // X position remains constant during animation.
      finalY,
      arrowX: xCoords.arrowX,
      arrowY,
      arrowAtTop: true,
      arrowVisible: true,
    };
  }

  /**
   * Get the metrics for positioning the div above the source.
   *
   * @param secondaryX Secondary/alternative origin point x, in absolute px.
   * @param secondaryY Secondary/alternative origin point y, in absolute px.
   * @param boundsInfo An object containing size information about the bounding
   *     element (bounding box and width/height).
   * @param divSize An object containing information about the size of the
   *     DropDownDiv (width & height).
   * @returns Various final metrics, including rendered positions for drop-down
   *     and arrow.
   */
  private getPositionAboveMetrics(
    secondaryX: number,
    secondaryY: number,
    boundsInfo: BoundsInfo,
    divSize: Size,
  ): PositionMetrics {
    const xCoords = this.getPositionX(
      secondaryX,
      boundsInfo.left,
      boundsInfo.right,
      divSize.width,
    );

    const arrowY = divSize.height - BORDER_SIZE * 2 - ARROW_SIZE / 2;
    const finalY = secondaryY - divSize.height - PADDING_Y;
    const initialY = secondaryY - divSize.height; // No padding on Y.

    return {
      initialX: xCoords.divX,
      initialY,
      finalX: xCoords.divX, // X position remains constant during animation.
      finalY,
      arrowX: xCoords.arrowX,
      arrowY,
      arrowAtTop: false,
      arrowVisible: true,
    };
  }

  /**
   * Get the metrics for positioning the div at the top of the page.
   *
   * @param sourceX Desired origin point x, in absolute px.
   * @param boundsInfo An object containing size information about the bounding
   *     element (bounding box and width/height).
   * @param divSize An object containing information about the size of the
   *     DropDownDiv (width & height).
   * @returns Various final metrics, including rendered positions for drop-down
   *     and arrow.
   */
  private getPositionTopOfPageMetrics(
    sourceX: number,
    boundsInfo: BoundsInfo,
    divSize: Size,
  ): PositionMetrics {
    const xCoords = this.getPositionX(
      sourceX,
      boundsInfo.left,
      boundsInfo.right,
      divSize.width,
    );

    // No need to provide arrow-specific information because it won't be visible.
    return {
      initialX: xCoords.divX,
      initialY: 0,
      finalX: xCoords.divX, // X position remains constant during animation.
      finalY: 0, // Y position remains constant during animation.
      arrowAtTop: null,
      arrowX: null,
      arrowY: null,
      arrowVisible: false,
    };
  }

  /**
   * Get the x positions for the left side of the DropDownDiv and the arrow,
   * accounting for the bounds of the workspace.
   *
   * @param sourceX Desired origin point x, in absolute px.
   * @param boundsLeft The left edge of the bounding element, in absolute px.
   * @param boundsRight The right edge of the bounding element, in absolute px.
   * @param divWidth The width of the div in px.
   * @returns An object containing metrics for the x positions of the left side of
   *     the DropDownDiv and the arrow.
   * @internal
   */
  public getPositionX(
    sourceX: number,
    boundsLeft: number,
    boundsRight: number,
    divWidth: number,
  ): {divX: number; arrowX: number} {
    let divX = sourceX;
    // Offset the topLeft coord so that the dropdowndiv is centered.
    divX -= divWidth / 2;
    // Fit the dropdowndiv within the bounds of the workspace.
    divX = math.clamp(boundsLeft, divX, boundsRight - divWidth);

    let arrowX = sourceX;
    // Offset the arrow coord so that the arrow is centered.
    arrowX -= ARROW_SIZE / 2;
    // Convert the arrow position to be relative to the top left of the div.
    let relativeArrowX = arrowX - divX;
    const horizPadding = ARROW_HORIZONTAL_PADDING;
    // Clamp the arrow position so that it stays attached to the dropdowndiv.
    relativeArrowX = math.clamp(
      horizPadding,
      relativeArrowX,
      divWidth - horizPadding - ARROW_SIZE,
    );

    return {arrowX: relativeArrowX, divX};
  }

  /**
   * Is the container visible?
   *
   * @returns True if visible.
   */
  public isVisible(): boolean {
    return !!this.owner;
  }

  /**
   * Hide the menu only if it is owned by the provided object.
   *
   * @param divOwner Object which must be owning the drop-down to hide.
   * @param opt_withoutAnimation True if we should hide the dropdown without
   *     animating.
   * @returns True if hidden.
   */
  public hideIfOwner<T>(
    divOwner: Field<T>,
    opt_withoutAnimation?: boolean,
  ): boolean {
    if (this.owner === divOwner) {
      if (opt_withoutAnimation) {
        this.hideWithoutAnimation();
      } else {
        this.hide();
      }
      return true;
    }
    return false;
  }

  /** Hide the menu, triggering animation. */
  public hide() {
    // Start the animation by setting the translation and fading out.
    // Reset to (initialX, initialY) - i.e., no translation.
    this.div.style.transform = 'translate(0, 0)';
    this.div.style.opacity = '0';
    // Finish animation - reset all values to default.
    this.animateOutTimer = setTimeout(this.hideWithoutAnimation, ANIMATION_TIME * 1000);
    if (this.onHide) {
      this.onHide();
      this.onHide = null;
    }
  }

  /** Hide the menu, without animation. */
  public hideWithoutAnimation() {
    if (!this.isVisible()) {
      return;
    }
    if (this.animateOutTimer) {
      clearTimeout(this.animateOutTimer);
    }

    // Reset style properties in case this gets called directly
    // instead of hide() - see discussion on #2551.
    this.div.style.transform = '';
    this.div.style.left = '';
    this.div.style.top = '';
    this.div.style.opacity = '0';
    this.div.style.display = 'none';
    this.div.style.backgroundColor = '';
    this.div.style.borderColor = '';

    if (this.onHide) {
      this.onHide();
      this.onHide = null;
    }
    this.clearContent();
    this.owner = null;

    if (this.renderedClassName) {
      dom.removeClass(this.div, this.renderedClassName);
      this.renderedClassName = '';
    }
    if (this.themeClassName) {
      dom.removeClass(this.div, this.themeClassName);
      this.themeClassName = '';
    }
    (common.getMainWorkspace() as WorkspaceSvg).markFocused();
  }

  /**
   * Set the dropdown div's position.
   *
   * @param primaryX Desired origin point x, in absolute px.
   * @param primaryY Desired origin point y, in absolute px.
   * @param secondaryX Secondary/alternative origin point x, in absolute px.
   * @param secondaryY Secondary/alternative origin point y, in absolute px.
   * @returns True if the menu rendered at the primary origin point.
   */
  private positionInternal(
    primaryX: number,
    primaryY: number,
    secondaryX: number,
    secondaryY: number,
  ): boolean {
    const metrics = this.getPositionMetrics(
      primaryX,
      primaryY,
      secondaryX,
      secondaryY,
    );

    // Update arrow CSS.
    if (metrics.arrowVisible) {
      this.arrow.style.display = '';
      this.arrow.style.transform =
        'translate(' +
        metrics.arrowX +
        'px,' +
        metrics.arrowY +
        'px) rotate(45deg)';
      this.arrow.setAttribute(
        'class',
        metrics.arrowAtTop
          ? 'blocklyDropDownArrow blocklyArrowTop'
          : 'blocklyDropDownArrow blocklyArrowBottom',
      );
    } else {
      this.arrow.style.display = 'none';
    }

    const initialX = Math.floor(metrics.initialX);
    const initialY = Math.floor(metrics.initialY);
    const finalX = Math.floor(metrics.finalX);
    const finalY = Math.floor(metrics.finalY);

    // First apply initial translation.
    this.div.style.left = initialX + 'px';
    this.div.style.top = initialY + 'px';

    // Show the div.
    this.div.style.display = 'block';
    this.div.style.opacity = '1';
    // Add final translate, animated through `transition`.
    // Coordinates are relative to (initialX, initialY),
    // where the drop-down is absolutely positioned.
    const dx = finalX - initialX;
    const dy = finalY - initialY;
    this.div.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';

    return !!metrics.arrowAtTop;
  }

  /**
   * Repositions the dropdownDiv on window resize. If it doesn't know how to
   * calculate the new position, it will just hide it instead.
   *
   * @internal
   */
  public repositionForWindowResize() {
    // This condition mainly catches the dropdown div when it is being used as a
    // dropdown.  It is important not to close it in this case because on Android,
    // when a field is focused, the soft keyboard opens triggering a window resize
    // event and we want the dropdown div to stick around so users can type into
    // it.
    if (this.owner) {
      const block = this.owner.getSourceBlock() as BlockSvg;
      const bBox = this.positionToField
        ? this.getScaledBboxOfField(this.owner)
        : this.getScaledBboxOfBlock(block);
      // If we can fit it, render below the block.
      const primaryX = bBox.left + (bBox.right - bBox.left) / 2;
      const primaryY = bBox.bottom;
      // If we can't fit it, render above the entire parent block.
      const secondaryX = primaryX;
      const secondaryY = bBox.top;
      this.positionInternal(primaryX, primaryY, secondaryX, secondaryY);
    } else {
      this.hide();
    }
  }
}
