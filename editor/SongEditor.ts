/*
Copyright (C) 2018 John Nesky

Permission is hereby granted, free of charge, to any person obtaining a copy of 
this software and associated documentation files (the "Software"), to deal in 
the Software without restriction, including without limitation the rights to 
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies 
of the Software, and to permit persons to whom the Software is furnished to do 
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all 
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE 
SOFTWARE.
*/

/// <reference path="../synth/synth.ts" />
/// <reference path="SongDocument.ts" />
/// <reference path="html.ts" />
/// <reference path="style.ts" />
/// <reference path="Prompt.ts" />
/// <reference path="PatternEditor.ts" />
/// <reference path="TrackEditor.ts" />
/// <reference path="LoopEditor.ts" />
/// <reference path="BarScrollBar.ts" />
/// <reference path="OctaveScrollBar.ts" />
/// <reference path="Piano.ts" />
/// <reference path="SongDurationPrompt.ts" />
/// <reference path="ExportPrompt.ts" />
/// <reference path="ImportPrompt.ts" />
/// <reference path="InstrumentTypePrompt.ts" />
/// <reference path="ChorusPrompt.ts" />

namespace beepbox {
	const {button, div, span, select, option, input, text} = html;
	
	const isMobile: boolean = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|android|ipad|playbook|silk/i.test(navigator.userAgent);
	
	function buildOptions(menu: HTMLSelectElement, items: ReadonlyArray<string | number>): HTMLSelectElement {
		for (const item of items) {
			menu.appendChild(option(item, item, false, false));
		}
		return menu;
	}
	
	function setSelectedIndex(menu: HTMLSelectElement, index: number): void {
		if (menu.selectedIndex != index) menu.selectedIndex = index;
	}
	
	function formatPercent(ratio: number): string {
		const percent: number = ratio * 100.0;
		return ((Math.floor(percent) == percent) ? percent.toFixed(0) : percent.toFixed(1)) + "%";
	}
	
	interface PatternCopy {
		notes: Note[];
		beatsPerBar: number;
		partsPerBeat: number;
		drums: boolean;
	}
	
	class Slider {
		private _change: Change | null = null;
		private _value: number = 0;
		private _oldValue: number = 0;
		
		constructor(public readonly input: HTMLInputElement, private readonly _doc: SongDocument, private readonly _getChange: (oldValue: number, newValue: number)=>Change) {
			input.addEventListener("input", this._whenInput);
			input.addEventListener("change", this._whenChange);
		}
		
		public updateValue(value: number): void {
			this._value = value;
			this.input.value = String(value);
		}
		
		private _whenInput = (): void => {
			const continuingProspectiveChange: boolean = this._doc.lastChangeWas(this._change);
			if (!continuingProspectiveChange) this._oldValue = this._value;
			this._change = this._getChange(this._oldValue, parseInt(this.input.value));
			this._doc.setProspectiveChange(this._change);
		};
		
		private _whenChange = (): void => {
			this._doc.record(this._change!);
			this._change = null;
		};
	}
	
	class PulseWidthBox {
		private _enabled: boolean = true;
		private _mouseDown: boolean = false;
		private _lastColumn: number = -1;
		private _hoverColumn: number = -1;
		private _hoverFillY: number = 0.0;
		private _hoverFillHeight: number = 0.0;
		private _change: Change | null = null;
		private _oldSequence: number[] | null = null;
		private _sequence: number[] | null = null;
		
		private readonly _editorWidth: number = Config.pulseStepsMax * 12;
		private readonly _editorHeight: number = Config.pulseWidthRange * 16;
		private readonly _verticalLines: SVGLineElement[] = [];
		private readonly _hoverHighlight: SVGRectElement = <SVGRectElement> svgElement("rect", {x: 0, y: 0, width: 1, height: this._editorHeight, fill: "#ffffff", opacity: "0.12", "pointer-events": "none", style: "display: none;"});
		private readonly _fills: SVGRectElement[] = [];
		private readonly _svg: SVGSVGElement = <SVGSVGElement> svgElement("svg", {
			style: "background-color: #000000; touch-action: none; overflow: visible; shape-rendering: crispEdges;",
			width: "100%",
			height: "100%",
			viewBox: `0 0 ${this._editorWidth} ${this._editorHeight}`,
			preserveAspectRatio: "none",
		});
		
		private readonly _disabledOverlay: HTMLDivElement = div({style: "position: absolute; left: 0; top: 0; right: 0; bottom: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); color: #999; font-size: .9em; pointer-events: none; user-select: none;"}, [text("Pulse Only")]);
		public readonly container: HTMLDivElement = div({style: "position: relative; flex: 1; min-height: 0; width: 100%; background: #000; border: 2px solid #333; box-sizing: border-box; padding: 2px;"}, [this._svg, this._disabledOverlay]);
		
		constructor(private readonly _doc: SongDocument) {
			const values: number = Config.pulseWidthRange;
			const segments: number = Math.max(1, values - 1);
			const cols: number = Config.pulseStepsMax;
			const segmentHeight: number = this._editorHeight / segments;
			
			this._svg.appendChild(svgElement("rect", {x: 0, y: 0, width: this._editorWidth, height: this._editorHeight, fill: "#000"}));
			
			// Grid (behind fills).
			for (let c: number = 1; c < cols; c++) {
				const line: SVGLineElement = <SVGLineElement> svgElement("line", {x1: 0, y1: 0, x2: 0, y2: this._editorHeight, stroke: "#111", "stroke-width": 1, "vector-effect": "non-scaling-stroke"});
				this._verticalLines[c - 1] = line;
				this._svg.appendChild(line);
			}
			for (let r: number = 1; r < segments; r++) {
				const y: number = r * segmentHeight;
				this._svg.appendChild(svgElement("rect", {x: 0, y, width: this._editorWidth, height: 1, fill: "#222"}));
			}
			
			// Hover highlight (behind fills).
			this._svg.appendChild(this._hoverHighlight);
			
			// Fills (render on top of grid).
			for (let c: number = 0; c < cols; c++) {
				const rect: SVGRectElement = <SVGRectElement> svgElement("rect", {
					x: 0,
					y: 0,
					width: this._editorWidth / cols,
					height: this._editorHeight,
					fill: "none",
				});
				this._fills[c] = rect;
				this._svg.appendChild(rect);
			}
			
			this.container.addEventListener("mousedown", this._whenMousePressed);
			this.container.addEventListener("mousemove", this._whenMouseHoverMoved);
			this.container.addEventListener("mouseleave", this._whenMouseHoverLeft);
			document.addEventListener("mousemove", this._whenMouseMoved);
			document.addEventListener("mouseup", this._whenMouseReleased);
			
			this.container.addEventListener("touchstart", this._whenTouchPressed, {passive: false});
			this.container.addEventListener("touchmove", this._whenTouchMoved, {passive: false});
			this.container.addEventListener("touchend", this._whenMouseReleased);
			this.container.addEventListener("touchcancel", this._whenMouseReleased);
		}

		public setEnabled(enabled: boolean): void {
			this._enabled = enabled;
			this._disabledOverlay.style.display = enabled ? "none" : "flex";
			this.container.style.opacity = enabled ? "" : "0.65";
			if (!enabled) {
				this._mouseDown = false;
				this._hoverColumn = -1;
				this._hoverHighlight.style.display = "none";
			}
		}
		
		public render(sequence: ReadonlyArray<number>, color: string): void {
			const values: number = Config.pulseWidthRange;
			const segments: number = Math.max(1, values - 1);
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseSteps | 0));
			const cellWidth: number = this._editorWidth / steps;
			
			// Update hover highlight to match current step grid.
			if (this._hoverColumn >= 0 && this._hoverColumn < steps) {
				this._hoverHighlight.setAttribute("x", "" + (this._hoverColumn * cellWidth));
				this._hoverHighlight.setAttribute("width", "" + cellWidth);
				this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
				this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
				this._hoverHighlight.style.display = "";
			} else {
				this._hoverHighlight.style.display = "none";
			}
			
			for (let c: number = 1; c < Config.pulseStepsMax; c++) {
				const line: SVGLineElement = this._verticalLines[c - 1];
				if (c < steps) {
					const x: number = c * cellWidth;
					line.setAttribute("x1", "" + x);
					line.setAttribute("x2", "" + x);
					line.style.display = "";
				} else {
					line.style.display = "none";
				}
			}
			
			for (let c: number = 0; c < Config.pulseStepsMax; c++) {
				const value: number = Math.max(0, Math.min(values - 1, sequence[c] | 0));
				// Lowest value (12.5%) shows no fill; highest value shows full height.
				const filledHeight: number = this._editorHeight * value / segments;
				const fill: SVGRectElement = this._fills[c];
				if (c < steps) {
					fill.setAttribute("x", "" + (c * cellWidth));
					fill.setAttribute("width", "" + cellWidth);
					fill.setAttribute("y", "" + (this._editorHeight - filledHeight));
					fill.setAttribute("height", "" + filledHeight);
					fill.setAttribute("fill", color);
					fill.style.display = "";
				} else {
					fill.style.display = "none";
				}
			}
		}
		
		private _beginEditIfNeeded(): void {
			if (this._oldSequence != null && this._sequence != null) return;
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			this._oldSequence = instrument.pulseSequence.slice();
			this._sequence = instrument.pulseSequence.slice();
			this._lastColumn = -1;
		}
		
		private _applyFromClientPoint(clientX: number, clientY: number): void {
			this._beginEditIfNeeded();
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			const values: number = Config.pulseWidthRange;
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			
			const sequence: number[] = this._sequence!;
			if (this._lastColumn != -1 && this._lastColumn != column) {
				let lowest: number = column;
				let highest: number = this._lastColumn;
				if (lowest > highest) { const temp: number = lowest; lowest = highest; highest = temp; }
				for (let c: number = lowest; c <= highest; c++) {
					sequence[c] = value;
				}
			} else {
				sequence[column] = value;
			}
			this._lastColumn = column;
			
			this._change = new ChangePulseSequence(this._doc, this._oldSequence!, sequence);
			this._doc.setProspectiveChange(this._change);
		}
		
		private _setHoverFromClientPoint(clientX: number, clientY: number): void {
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			this._hoverColumn = column;
			
			// Quantize to valid duty-cycle levels (same mapping as editing).
			const values: number = Config.pulseWidthRange;
			const segments: number = Math.max(1, values - 1);
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			const filledHeight: number = this._editorHeight * value / segments;
			this._hoverFillY = this._editorHeight - filledHeight;
			this._hoverFillHeight = filledHeight;
			
			const cellWidth: number = this._editorWidth / steps;
			this._hoverHighlight.setAttribute("x", "" + (column * cellWidth));
			this._hoverHighlight.setAttribute("width", "" + cellWidth);
			this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
			this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
			this._hoverHighlight.style.display = "";
		}
		
		private _whenMouseHoverMoved = (event: MouseEvent): void => {
			if (!this._enabled) return;
			if (this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseHoverLeft = (): void => {
			this._hoverColumn = -1;
			this._hoverHighlight.style.display = "none";
		}
		
		private _whenMousePressed = (event: MouseEvent): void => {
			if (!this._enabled) return;
			event.preventDefault();
			this._mouseDown = true;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseMoved = (event: MouseEvent): void => {
			if (!this._enabled) return;
			if (!this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseReleased = (): void => {
			if (!this._mouseDown) return;
			this._mouseDown = false;
			if (this._change != null) {
				this._doc.record(this._change);
				this._change = null;
			}
			this._oldSequence = null;
			this._sequence = null;
			this._lastColumn = -1;
		}
		
		private _whenTouchPressed = (event: TouchEvent): void => {
			if (!this._enabled) return;
			event.preventDefault();
			this._mouseDown = true;
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
		
		private _whenTouchMoved = (event: TouchEvent): void => {
			if (!this._enabled) return;
			if (!this._mouseDown) return;
			event.preventDefault();
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
	}
	
	class PulseVolumeBox {
		private _mouseDown: boolean = false;
		private _lastColumn: number = -1;
		private _hoverColumn: number = -1;
		private _hoverFillY: number = 0.0;
		private _hoverFillHeight: number = 0.0;
		private _change: Change | null = null;
		private _oldSequence: number[] | null = null;
		private _sequence: number[] | null = null;
		
		private readonly _editorWidth: number = Config.pulseStepsMax * 12;
		private readonly _editorHeight: number = Config.pulseVolumeRange * 4;
		private readonly _verticalLines: SVGLineElement[] = [];
		private readonly _hoverHighlight: SVGRectElement = <SVGRectElement> svgElement("rect", {x: 0, y: 0, width: 1, height: this._editorHeight, fill: "#ffffff", opacity: "0.12", "pointer-events": "none", style: "display: none;"});
		private readonly _fills: SVGRectElement[] = [];
		private readonly _svg: SVGSVGElement = <SVGSVGElement> svgElement("svg", {
			style: "background-color: #000000; touch-action: none; overflow: visible; shape-rendering: crispEdges;",
			width: "100%",
			height: "100%",
			viewBox: `0 0 ${this._editorWidth} ${this._editorHeight}`,
			preserveAspectRatio: "none",
		});
		
		public readonly container: HTMLDivElement = div({style: "flex: 1; min-height: 0; width: 100%; background: #000; border: 2px solid #333; box-sizing: border-box; padding: 2px;"}, [this._svg]);
		
		constructor(private readonly _doc: SongDocument) {
			const values: number = Config.pulseVolumeRange;
			const segments: number = Math.max(1, values - 1);
			const cols: number = Config.pulseStepsMax;
			const segmentHeight: number = this._editorHeight / segments;
			
			this._svg.appendChild(svgElement("rect", {x: 0, y: 0, width: this._editorWidth, height: this._editorHeight, fill: "#000"}));
			
			// Grid (behind fills).
			for (let c: number = 1; c < cols; c++) {
				const line: SVGLineElement = <SVGLineElement> svgElement("line", {x1: 0, y1: 0, x2: 0, y2: this._editorHeight, stroke: "#111", "stroke-width": 1, "vector-effect": "non-scaling-stroke"});
				this._verticalLines[c - 1] = line;
				this._svg.appendChild(line);
			}
			for (let r: number = 1; r < segments; r++) {
				const y: number = r * segmentHeight;
				this._svg.appendChild(svgElement("rect", {x: 0, y, width: this._editorWidth, height: 1, fill: "#222"}));
			}
			
			// Hover highlight (behind fills).
			this._svg.appendChild(this._hoverHighlight);
			
			// Fills (render on top of grid).
			for (let c: number = 0; c < cols; c++) {
				const rect: SVGRectElement = <SVGRectElement> svgElement("rect", {
					x: 0,
					y: 0,
					width: this._editorWidth / cols,
					height: this._editorHeight,
					fill: "none",
				});
				this._fills[c] = rect;
				this._svg.appendChild(rect);
			}
			
			this.container.addEventListener("mousedown", this._whenMousePressed);
			this.container.addEventListener("mousemove", this._whenMouseHoverMoved);
			this.container.addEventListener("mouseleave", this._whenMouseHoverLeft);
			document.addEventListener("mousemove", this._whenMouseMoved);
			document.addEventListener("mouseup", this._whenMouseReleased);
			
			this.container.addEventListener("touchstart", this._whenTouchPressed, {passive: false});
			this.container.addEventListener("touchmove", this._whenTouchMoved, {passive: false});
			this.container.addEventListener("touchend", this._whenMouseReleased);
			this.container.addEventListener("touchcancel", this._whenMouseReleased);
		}
		
		public render(sequence: ReadonlyArray<number>, color: string): void {
			const values: number = Config.pulseVolumeRange;
			const segments: number = Math.max(1, values - 1);
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseVolumeSteps | 0));
			const cellWidth: number = this._editorWidth / steps;
			
			// Update hover highlight to match current step grid.
			if (this._hoverColumn >= 0 && this._hoverColumn < steps) {
				this._hoverHighlight.setAttribute("x", "" + (this._hoverColumn * cellWidth));
				this._hoverHighlight.setAttribute("width", "" + cellWidth);
				this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
				this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
				this._hoverHighlight.style.display = "";
			} else {
				this._hoverHighlight.style.display = "none";
			}
			
			for (let c: number = 1; c < Config.pulseStepsMax; c++) {
				const line: SVGLineElement = this._verticalLines[c - 1];
				if (c < steps) {
					const x: number = c * cellWidth;
					line.setAttribute("x1", "" + x);
					line.setAttribute("x2", "" + x);
					line.style.display = "";
				} else {
					line.style.display = "none";
				}
			}
			
			for (let c: number = 0; c < Config.pulseStepsMax; c++) {
				const value: number = Math.max(0, Math.min(values - 1, sequence[c] | 0));
				const filledHeight: number = this._editorHeight * value / segments;
				const fill: SVGRectElement = this._fills[c];
				if (c < steps) {
					fill.setAttribute("x", "" + (c * cellWidth));
					fill.setAttribute("width", "" + cellWidth);
					fill.setAttribute("y", "" + (this._editorHeight - filledHeight));
					fill.setAttribute("height", "" + filledHeight);
					fill.setAttribute("fill", color);
					fill.style.display = "";
				} else {
					fill.style.display = "none";
				}
			}
		}
		
		private _beginEditIfNeeded(): void {
			if (this._oldSequence != null && this._sequence != null) return;
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			this._oldSequence = instrument.pulseVolumeSequence.slice();
			this._sequence = instrument.pulseVolumeSequence.slice();
			this._lastColumn = -1;
		}
		
		private _applyFromClientPoint(clientX: number, clientY: number): void {
			this._beginEditIfNeeded();
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseVolumeSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			const values: number = Config.pulseVolumeRange;
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			
			const sequence: number[] = this._sequence!;
			if (this._lastColumn != -1 && this._lastColumn != column) {
				let lowest: number = column;
				let highest: number = this._lastColumn;
				if (lowest > highest) { const temp: number = lowest; lowest = highest; highest = temp; }
				for (let c: number = lowest; c <= highest; c++) {
					sequence[c] = value;
				}
			} else {
				sequence[column] = value;
			}
			this._lastColumn = column;
			
			this._change = new ChangePulseVolumeSequence(this._doc, this._oldSequence!, sequence);
			this._doc.setProspectiveChange(this._change);
		}
		
		private _setHoverFromClientPoint(clientX: number, clientY: number): void {
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseVolumeSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			this._hoverColumn = column;
			
			// Quantize to valid volume levels (same mapping as editing).
			const values: number = Config.pulseVolumeRange;
			const segments: number = Math.max(1, values - 1);
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			const filledHeight: number = this._editorHeight * value / segments;
			this._hoverFillY = this._editorHeight - filledHeight;
			this._hoverFillHeight = filledHeight;
			
			const cellWidth: number = this._editorWidth / steps;
			this._hoverHighlight.setAttribute("x", "" + (column * cellWidth));
			this._hoverHighlight.setAttribute("width", "" + cellWidth);
			this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
			this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
			this._hoverHighlight.style.display = "";
		}
		
		private _whenMouseHoverMoved = (event: MouseEvent): void => {
			if (this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseHoverLeft = (): void => {
			this._hoverColumn = -1;
			this._hoverHighlight.style.display = "none";
		}
		
		private _whenMousePressed = (event: MouseEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseMoved = (event: MouseEvent): void => {
			if (!this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseReleased = (): void => {
			if (!this._mouseDown) return;
			this._mouseDown = false;
			if (this._change != null) {
				this._doc.record(this._change);
				this._change = null;
			}
			this._oldSequence = null;
			this._sequence = null;
			this._lastColumn = -1;
		}
		
		private _whenTouchPressed = (event: TouchEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
		
		private _whenTouchMoved = (event: TouchEvent): void => {
			if (!this._mouseDown) return;
			event.preventDefault();
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
	}

	class PulsePitchBox {
		private _mouseDown: boolean = false;
		private _lastColumn: number = -1;
		private _hoverColumn: number = -1;
		private _hoverFillY: number = 0.0;
		private _hoverFillHeight: number = 0.0;
		private _change: Change | null = null;
		private _oldSequence: number[] | null = null;
		private _sequence: number[] | null = null;
		
		private readonly _editorWidth: number = Config.pulseStepsMax * 12;
		private readonly _editorHeight: number = Config.pulsePitchRange * 4;
		private readonly _verticalLines: SVGLineElement[] = [];
		private readonly _hoverHighlight: SVGRectElement = <SVGRectElement> svgElement("rect", {x: 0, y: 0, width: 1, height: this._editorHeight, fill: "#ffffff", opacity: "0.12", "pointer-events": "none", style: "display: none;"});
		private readonly _fills: SVGRectElement[] = [];
		private readonly _svg: SVGSVGElement = <SVGSVGElement> svgElement("svg", {
			style: "background-color: #000000; touch-action: none; overflow: visible; shape-rendering: crispEdges;",
			width: "100%",
			height: "100%",
			viewBox: `0 0 ${this._editorWidth} ${this._editorHeight}`,
			preserveAspectRatio: "none",
		});
		
		public readonly container: HTMLDivElement = div({style: "flex: 1; min-height: 0; width: 100%; background: #000; border: 2px solid #333; box-sizing: border-box; padding: 2px;"}, [this._svg]);
		
		constructor(private readonly _doc: SongDocument) {
			const values: number = Config.pulsePitchRange;
			const segments: number = Math.max(1, values - 1);
			const cols: number = Config.pulseStepsMax;
			const segmentHeight: number = this._editorHeight / segments;
			
			this._svg.appendChild(svgElement("rect", {x: 0, y: 0, width: this._editorWidth, height: this._editorHeight, fill: "#000"}));
			
			// Grid (behind fills).
			for (let c: number = 1; c < cols; c++) {
				const line: SVGLineElement = <SVGLineElement> svgElement("line", {x1: 0, y1: 0, x2: 0, y2: this._editorHeight, stroke: "#111", "stroke-width": 1, "vector-effect": "non-scaling-stroke"});
				this._verticalLines[c - 1] = line;
				this._svg.appendChild(line);
			}
			for (let r: number = 1; r < segments; r++) {
				const y: number = r * segmentHeight;
				this._svg.appendChild(svgElement("rect", {x: 0, y, width: this._editorWidth, height: 1, fill: "#222"}));
			}
			
			// Hover highlight (behind fills).
			this._svg.appendChild(this._hoverHighlight);
			
			// Fills (render on top of grid).
			for (let c: number = 0; c < cols; c++) {
				const rect: SVGRectElement = <SVGRectElement> svgElement("rect", {
					x: 0,
					y: 0,
					width: this._editorWidth / cols,
					height: this._editorHeight,
					fill: "none",
				});
				this._fills[c] = rect;
				this._svg.appendChild(rect);
			}
			
			this.container.addEventListener("mousedown", this._whenMousePressed);
			this.container.addEventListener("mousemove", this._whenMouseHoverMoved);
			this.container.addEventListener("mouseleave", this._whenMouseHoverLeft);
			document.addEventListener("mousemove", this._whenMouseMoved);
			document.addEventListener("mouseup", this._whenMouseReleased);
			
			this.container.addEventListener("touchstart", this._whenTouchPressed, {passive: false});
			this.container.addEventListener("touchmove", this._whenTouchMoved, {passive: false});
			this.container.addEventListener("touchend", this._whenMouseReleased);
			this.container.addEventListener("touchcancel", this._whenMouseReleased);
		}
		
		public render(sequence: ReadonlyArray<number>, color: string): void {
			const values: number = Config.pulsePitchRange;
			const segments: number = Math.max(1, values - 1);
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulsePitchSteps | 0));
			const cellWidth: number = this._editorWidth / steps;
			
			// Update hover highlight to match current step grid.
			if (this._hoverColumn >= 0 && this._hoverColumn < steps) {
				this._hoverHighlight.setAttribute("x", "" + (this._hoverColumn * cellWidth));
				this._hoverHighlight.setAttribute("width", "" + cellWidth);
				this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
				this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
				this._hoverHighlight.style.display = "";
			} else {
				this._hoverHighlight.style.display = "none";
			}
			
			for (let c: number = 1; c < Config.pulseStepsMax; c++) {
				const line: SVGLineElement = this._verticalLines[c - 1];
				if (c < steps) {
					const x: number = c * cellWidth;
					line.setAttribute("x1", "" + x);
					line.setAttribute("x2", "" + x);
					line.style.display = "";
				} else {
					line.style.display = "none";
				}
			}
			
			for (let c: number = 0; c < Config.pulseStepsMax; c++) {
				const value: number = Math.max(0, Math.min(values - 1, sequence[c] | 0));
				const filledHeight: number = this._editorHeight * value / segments;
				const fill: SVGRectElement = this._fills[c];
				if (c < steps) {
					fill.setAttribute("x", "" + (c * cellWidth));
					fill.setAttribute("width", "" + cellWidth);
					fill.setAttribute("y", "" + (this._editorHeight - filledHeight));
					fill.setAttribute("height", "" + filledHeight);
					fill.setAttribute("fill", color);
					fill.style.display = "";
				} else {
					fill.style.display = "none";
				}
			}
		}
		
		private _beginEditIfNeeded(): void {
			if (this._oldSequence != null && this._sequence != null) return;
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			this._oldSequence = instrument.pulsePitchSequence.slice();
			this._sequence = instrument.pulsePitchSequence.slice();
			this._lastColumn = -1;
		}
		
		private _applyFromClientPoint(clientX: number, clientY: number): void {
			this._beginEditIfNeeded();
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulsePitchSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			const values: number = Config.pulsePitchRange;
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			
			const sequence: number[] = this._sequence!;
			if (this._lastColumn != -1 && this._lastColumn != column) {
				let lowest: number = column;
				let highest: number = this._lastColumn;
				if (lowest > highest) { const temp: number = lowest; lowest = highest; highest = temp; }
				for (let c: number = lowest; c <= highest; c++) {
					sequence[c] = value;
				}
			} else {
				sequence[column] = value;
			}
			this._lastColumn = column;
			
			this._change = new ChangePulsePitchSequence(this._doc, this._oldSequence!, sequence);
			this._doc.setProspectiveChange(this._change);
		}
		
		private _setHoverFromClientPoint(clientX: number, clientY: number): void {
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulsePitchSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			this._hoverColumn = column;
			
			const values: number = Config.pulsePitchRange;
			const segments: number = Math.max(1, values - 1);
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			const filledHeight: number = this._editorHeight * value / segments;
			this._hoverFillY = this._editorHeight - filledHeight;
			this._hoverFillHeight = filledHeight;
			
			const cellWidth: number = this._editorWidth / steps;
			this._hoverHighlight.setAttribute("x", "" + (column * cellWidth));
			this._hoverHighlight.setAttribute("width", "" + cellWidth);
			this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
			this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
			this._hoverHighlight.style.display = "";
		}
		
		private _whenMouseHoverMoved = (event: MouseEvent): void => {
			if (this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseHoverLeft = (): void => {
			this._hoverColumn = -1;
			this._hoverHighlight.style.display = "none";
		}
		
		private _whenMousePressed = (event: MouseEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseMoved = (event: MouseEvent): void => {
			if (!this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseReleased = (): void => {
			if (!this._mouseDown) return;
			this._mouseDown = false;
			if (this._change != null) {
				this._doc.record(this._change);
				this._change = null;
			}
			this._oldSequence = null;
			this._sequence = null;
			this._lastColumn = -1;
		}
		
		private _whenTouchPressed = (event: TouchEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
		
		private _whenTouchMoved = (event: TouchEvent): void => {
			if (!this._mouseDown) return;
			event.preventDefault();
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
	}

	class PulseHiPitchBox {
		private _mouseDown: boolean = false;
		private _lastColumn: number = -1;
		private _hoverColumn: number = -1;
		private _hoverFillY: number = 0.0;
		private _hoverFillHeight: number = 0.0;
		private _change: Change | null = null;
		private _oldSequence: number[] | null = null;
		private _sequence: number[] | null = null;
		
		private readonly _editorWidth: number = Config.pulseStepsMax * 12;
		private readonly _editorHeight: number = Config.pulseHiPitchRange * 4;
		private readonly _verticalLines: SVGLineElement[] = [];
		private readonly _hoverHighlight: SVGRectElement = <SVGRectElement> svgElement("rect", {x: 0, y: 0, width: 1, height: this._editorHeight, fill: "#ffffff", opacity: "0.12", "pointer-events": "none", style: "display: none;"});
		private readonly _fills: SVGRectElement[] = [];
		private readonly _svg: SVGSVGElement = <SVGSVGElement> svgElement("svg", {
			style: "background-color: #000000; touch-action: none; overflow: visible; shape-rendering: crispEdges;",
			width: "100%",
			height: "100%",
			viewBox: `0 0 ${this._editorWidth} ${this._editorHeight}`,
			preserveAspectRatio: "none",
		});
		
		public readonly container: HTMLDivElement = div({style: "flex: 1; min-height: 0; width: 100%; background: #000; border: 2px solid #333; box-sizing: border-box; padding: 2px;"}, [this._svg]);
		
		constructor(private readonly _doc: SongDocument) {
			const values: number = Config.pulseHiPitchRange;
			const segments: number = Math.max(1, values - 1);
			const cols: number = Config.pulseStepsMax;
			const segmentHeight: number = this._editorHeight / segments;
			
			this._svg.appendChild(svgElement("rect", {x: 0, y: 0, width: this._editorWidth, height: this._editorHeight, fill: "#000"}));
			
			// Grid (behind fills).
			for (let c: number = 1; c < cols; c++) {
				const line: SVGLineElement = <SVGLineElement> svgElement("line", {x1: 0, y1: 0, x2: 0, y2: this._editorHeight, stroke: "#111", "stroke-width": 1, "vector-effect": "non-scaling-stroke"});
				this._verticalLines[c - 1] = line;
				this._svg.appendChild(line);
			}
			for (let r: number = 1; r < segments; r++) {
				const y: number = r * segmentHeight;
				this._svg.appendChild(svgElement("rect", {x: 0, y, width: this._editorWidth, height: 1, fill: "#222"}));
			}
			
			// Hover highlight (behind fills).
			this._svg.appendChild(this._hoverHighlight);
			
			// Fills (render on top of grid).
			for (let c: number = 0; c < cols; c++) {
				const rect: SVGRectElement = <SVGRectElement> svgElement("rect", {
					x: 0,
					y: 0,
					width: this._editorWidth / cols,
					height: this._editorHeight,
					fill: "none",
				});
				this._fills[c] = rect;
				this._svg.appendChild(rect);
			}
			
			this.container.addEventListener("mousedown", this._whenMousePressed);
			this.container.addEventListener("mousemove", this._whenMouseHoverMoved);
			this.container.addEventListener("mouseleave", this._whenMouseHoverLeft);
			document.addEventListener("mousemove", this._whenMouseMoved);
			document.addEventListener("mouseup", this._whenMouseReleased);
			
			this.container.addEventListener("touchstart", this._whenTouchPressed, {passive: false});
			this.container.addEventListener("touchmove", this._whenTouchMoved, {passive: false});
			this.container.addEventListener("touchend", this._whenMouseReleased);
			this.container.addEventListener("touchcancel", this._whenMouseReleased);
		}
		
		public render(sequence: ReadonlyArray<number>, color: string): void {
			const values: number = Config.pulseHiPitchRange;
			const segments: number = Math.max(1, values - 1);
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseHiPitchSteps | 0));
			const cellWidth: number = this._editorWidth / steps;
			
			// Update hover highlight to match current step grid.
			if (this._hoverColumn >= 0 && this._hoverColumn < steps) {
				this._hoverHighlight.setAttribute("x", "" + (this._hoverColumn * cellWidth));
				this._hoverHighlight.setAttribute("width", "" + cellWidth);
				this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
				this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
				this._hoverHighlight.style.display = "";
			} else {
				this._hoverHighlight.style.display = "none";
			}
			
			for (let c: number = 1; c < Config.pulseStepsMax; c++) {
				const line: SVGLineElement = this._verticalLines[c - 1];
				if (c < steps) {
					const x: number = c * cellWidth;
					line.setAttribute("x1", "" + x);
					line.setAttribute("x2", "" + x);
					line.style.display = "";
				} else {
					line.style.display = "none";
				}
			}
			
			for (let c: number = 0; c < Config.pulseStepsMax; c++) {
				const value: number = Math.max(0, Math.min(values - 1, sequence[c] | 0));
				const filledHeight: number = this._editorHeight * value / segments;
				const fill: SVGRectElement = this._fills[c];
				if (c < steps) {
					fill.setAttribute("x", "" + (c * cellWidth));
					fill.setAttribute("width", "" + cellWidth);
					fill.setAttribute("y", "" + (this._editorHeight - filledHeight));
					fill.setAttribute("height", "" + filledHeight);
					fill.setAttribute("fill", color);
					fill.style.display = "";
				} else {
					fill.style.display = "none";
				}
			}
		}
		
		private _beginEditIfNeeded(): void {
			if (this._oldSequence != null && this._sequence != null) return;
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			this._oldSequence = instrument.pulseHiPitchSequence.slice();
			this._sequence = instrument.pulseHiPitchSequence.slice();
			this._lastColumn = -1;
		}
		
		private _applyFromClientPoint(clientX: number, clientY: number): void {
			this._beginEditIfNeeded();
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseHiPitchSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			const values: number = Config.pulseHiPitchRange;
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			
			const sequence: number[] = this._sequence!;
			if (this._lastColumn != -1 && this._lastColumn != column) {
				let lowest: number = column;
				let highest: number = this._lastColumn;
				if (lowest > highest) { const temp: number = lowest; lowest = highest; highest = temp; }
				for (let c: number = lowest; c <= highest; c++) {
					sequence[c] = value;
				}
			} else {
				sequence[column] = value;
			}
			this._lastColumn = column;
			
			this._change = new ChangePulseHiPitchSequence(this._doc, this._oldSequence!, sequence);
			this._doc.setProspectiveChange(this._change);
		}
		
		private _setHoverFromClientPoint(clientX: number, clientY: number): void {
			const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
			const steps: number = Math.max(1, Math.min(Config.pulseStepsMax, instrument.pulseHiPitchSteps | 0));
			const rect: ClientRect = this._svg.getBoundingClientRect();
			let x: number = (clientX - rect.left) / (rect.right - rect.left);
			let y: number = (clientY - rect.top) / (rect.bottom - rect.top);
			if (isNaN(x)) x = 0;
			if (isNaN(y)) y = 0;
			x = Math.max(0, Math.min(0.999999, x));
			y = Math.max(0, Math.min(0.999999, y));
			const column: number = Math.min(steps - 1, Math.floor(x * steps));
			this._hoverColumn = column;
			
			const values: number = Config.pulseHiPitchRange;
			const segments: number = Math.max(1, values - 1);
			const value: number = Math.max(0, Math.min(values - 1, Math.round((1.0 - y) * (values - 1))));
			const filledHeight: number = this._editorHeight * value / segments;
			this._hoverFillY = this._editorHeight - filledHeight;
			this._hoverFillHeight = filledHeight;
			
			const cellWidth: number = this._editorWidth / steps;
			this._hoverHighlight.setAttribute("x", "" + (column * cellWidth));
			this._hoverHighlight.setAttribute("width", "" + cellWidth);
			this._hoverHighlight.setAttribute("y", "" + this._hoverFillY);
			this._hoverHighlight.setAttribute("height", "" + this._hoverFillHeight);
			this._hoverHighlight.style.display = "";
		}
		
		private _whenMouseHoverMoved = (event: MouseEvent): void => {
			if (this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseHoverLeft = (): void => {
			this._hoverColumn = -1;
			this._hoverHighlight.style.display = "none";
		}
		
		private _whenMousePressed = (event: MouseEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseMoved = (event: MouseEvent): void => {
			if (!this._mouseDown) return;
			this._setHoverFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
			this._applyFromClientPoint(event.clientX || event.pageX, event.clientY || event.pageY);
		}
		
		private _whenMouseReleased = (): void => {
			if (!this._mouseDown) return;
			this._mouseDown = false;
			if (this._change != null) {
				this._doc.record(this._change);
				this._change = null;
			}
			this._oldSequence = null;
			this._sequence = null;
			this._lastColumn = -1;
		}
		
		private _whenTouchPressed = (event: TouchEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
		
		private _whenTouchMoved = (event: TouchEvent): void => {
			if (!this._mouseDown) return;
			event.preventDefault();
			this._applyFromClientPoint(event.touches[0].clientX, event.touches[0].clientY);
		}
	}
	
	export class SongEditor {
		public prompt: Prompt | null = null;
		
		private readonly _patternEditorPrev: PatternEditor = new PatternEditor(this._doc, false, -1);
		private readonly _patternEditor: PatternEditor = new PatternEditor(this._doc, true, 0);
		private readonly _patternEditorNext: PatternEditor = new PatternEditor(this._doc, false, 1);
		private readonly _trackEditor: TrackEditor = new TrackEditor(this._doc, this);
		private readonly _loopEditor: LoopEditor = new LoopEditor(this._doc);
		private readonly _trackContainer: HTMLDivElement = div({className: "trackContainer"}, [
			this._trackEditor.container,
			this._loopEditor.container,
		]);
		private readonly _barScrollBar: BarScrollBar = new BarScrollBar(this._doc, this._trackContainer);
		private readonly _octaveScrollBar: OctaveScrollBar = new OctaveScrollBar(this._doc);
		private readonly _piano: Piano = new Piano(this._doc);
		private readonly _patternEditorRow: HTMLDivElement = div({className: "patternEditorRow", style: "flex: 1; height: 100%; display: flex; overflow: hidden; justify-content: center;"}, [
			this._patternEditorPrev.container,
			this._patternEditor.container,
			this._patternEditorNext.container,
		]);
		private readonly _patternArea: HTMLDivElement = div({className: "pattern-area"}, [
			this._piano.container,
			this._patternEditorRow,
			this._octaveScrollBar.container,
		]);
		private readonly _trackArea: HTMLDivElement = div({className: "track-area"}, [
			this._trackContainer,
			this._barScrollBar.container,
		]);
		private readonly _playButton: HTMLButtonElement = button({style: "width: 80px;", type: "button"});
		private readonly _prevBarButton: HTMLButtonElement = button({className: "prevBarButton", style: "width: 40px;", type: "button", title: "Previous Bar (left bracket)"});
		private readonly _nextBarButton: HTMLButtonElement = button({className: "nextBarButton", style: "width: 40px;", type: "button", title: "Next Bar (right bracket)"});
		private readonly _volumeSlider: HTMLInputElement = input({title: "main volume", style: "width: 5em; flex-grow: 1; margin: 0px;", type: "range", min: "0", max: "100", value: "50", step: "1"});
		private readonly _editMenu: HTMLSelectElement = select({style: "width: 100%;"}, [
			option("", "Edit", true, true),
			option("undo", "Undo (Z)", false, false),
			option("redo", "Redo (Y)", false, false),
			option("copy", "Copy Pattern (C)", false, false),
			option("paste", "Paste Pattern (V)", false, false),
			option("transposeUp", "Shift Notes Up (+)", false, false),
			option("transposeDown", "Shift Notes Down (-)", false, false),
			option("duration", "Custom song size...", false, false),
			option("import", "Import JSON...", false, false),
		]);
		private readonly _optionsMenu: HTMLSelectElement = select({style: "width: 100%;"}, [
			option("", "Preferences", true, true),
			option("autoPlay", "Auto Play On Load", false, false),
			option("autoFollow", "Auto Follow Track", false, false),
			option("showLetters", "Show Piano", false, false),
			option("showFifth", "Highlight 'Fifth' Notes", false, false),
			option("showChannels", "Show All Channels", false, false),
			option("showScrollBar", "Octave Scroll Bar", false, false),
		]);
		private readonly _newSongButton: HTMLButtonElement = button({type: "button"}, [
			text("New"),
			span({className: "fullWidthOnly"}, [text(" Song")]),
			// Page icon:
			svgElement("svg", {style: "flex-shrink: 0; position: absolute; left: 0; top: 50%; margin-top: -1em; pointer-events: none;", width: "2em", height: "2em", viewBox: "-5 -21 26 26"}, [
				svgElement("path", {d: "M 2 0 L 2 -16 L 10 -16 L 14 -12 L 14 0 z M 3 -1 L 13 -1 L 13 -11 L 9 -11 L 9 -15 L 3 -15 z", fill: "currentColor"}),
			]),
		]);
		private readonly _exportButton: HTMLButtonElement = button({type: "button"}, [
			text("Export"),
			// Download icon:
			svgElement("svg", {style: "flex-shrink: 0; position: absolute; left: 0; top: 50%; margin-top: -1em; pointer-events: none;", width: "2em", height: "2em", viewBox: "-13 -13 26 26"}, [
				svgElement("path", {d: "M -8 3 L -8 8 L 8 8 L 8 3 L 6 3 L 6 6 L -6 6 L -6 3 z M 0 2 L -4 -2 L -1 -2 L -1 -8 L 1 -8 L 1 -2 L 4 -2 z", fill: "currentColor"}),
			]),
		]);
		private readonly _scaleSelect: HTMLSelectElement = buildOptions(select({}), Config.scaleNames);
		private readonly _keySelect: HTMLSelectElement = buildOptions(select({}), Config.keyNames);
		private readonly _tempoSlider: Slider = new Slider(input({style: "margin: 0px;", type: "range", min: "0", max: Config.tempoSteps - 1, value: "7", step: "1"}), this._doc, (oldValue: number, newValue: number) => new ChangeTempo(this._doc, oldValue, newValue));
		private readonly _reverbSlider: Slider = new Slider(input({style: "margin: 0px;", type: "range", min: "0", max: Config.reverbRange - 1, value: "0", step: "1"}), this._doc, (oldValue: number, newValue: number) => new ChangeReverb(this._doc, oldValue, newValue));
		private readonly _partSelect: HTMLSelectElement = buildOptions(select({}), Config.partNames);
		private readonly _instrumentTypeSelect: HTMLSelectElement = buildOptions(select({}), Config.pitchChannelTypeNames);
		private readonly _instrumentTypeHint = <HTMLAnchorElement> html.element("a", {className: "hintButton"}, [text("?")]);
		private readonly _instrumentTypeSelectRow: HTMLDivElement = div({className: "selectRow"}, [span({}, [text("Type: ")]), this._instrumentTypeHint, div({className: "selectContainer"}, [this._instrumentTypeSelect])]);
		private readonly _pulseWaveSelect: HTMLSelectElement = select({}, [
			option("pulse", "pulse", true, false),
			option("triangle", "triangle", false, false),
		]);
		private readonly _pulseWaveSelectRow: HTMLDivElement = div({className: "selectRow"}, [
			span({}, [text("Wave: ")]),
			div({className: "selectContainer"}, [this._pulseWaveSelect]),
		]);
		private readonly _pulseNesAccurateCheckbox: HTMLInputElement = input({type: "checkbox", title: "NES accurate pulse rendering"});
		private readonly _pulseNesAccurateRow: HTMLDivElement = div({className: "selectRow", style: "justify-content: flex-start; gap: .4em;"}, [
			span({}, [text("NES:")]),
			this._pulseNesAccurateCheckbox,
		]);
		private readonly _algorithmSelect: HTMLSelectElement = buildOptions(select({}), Config.operatorAlgorithmNames);
		private readonly _algorithmSelectRow: HTMLDivElement = div({className: "selectRow"}, [span({}, [text("Algorithm: ")]), div({className: "selectContainer"}, [this._algorithmSelect])]);
		private readonly _instrumentSelect: HTMLSelectElement = select({});
		private readonly _instrumentSelectRow: HTMLDivElement = div({className: "selectRow", style: "display: none;"}, [span({}, [text("Instrument: ")]), div({className: "selectContainer"}, [this._instrumentSelect])]);
		private readonly _instrumentVolumeSlider: Slider = new Slider(input({style: "margin: 0px;", type: "range", min: "-5", max: "0", value: "0", step: "1"}), this._doc, (oldValue: number, newValue: number) => new ChangeVolume(this._doc, oldValue, -newValue));
		private readonly _instrumentVolumeSliderRow: HTMLDivElement = div({className: "selectRow"}, [span({}, [text("Volume: ")]), this._instrumentVolumeSlider.input]);
			private readonly _waveSelect: HTMLSelectElement = buildOptions(select({}), Config.waveNames);
			private readonly _drumSelect: HTMLSelectElement = buildOptions(select({}), Config.drumNames);
			private readonly _waveSelectRow: HTMLDivElement = div({className: "selectRow"}, [span({}, [text("Wave: ")]), div({className: "selectContainer"}, [this._waveSelect, this._drumSelect])]);
			private readonly _pulseWidthBox: PulseWidthBox = new PulseWidthBox(this._doc);
			private readonly _pulseVolumeBox: PulseVolumeBox = new PulseVolumeBox(this._doc);
			private readonly _pulsePitchBox: PulsePitchBox = new PulsePitchBox(this._doc);
			private readonly _pulseHiPitchBox: PulseHiPitchBox = new PulseHiPitchBox(this._doc);
			private readonly _pulseDutyTextInput: HTMLInputElement = input({type: "text", style: "width: 100%; margin: 4px 0 0 0; box-sizing: border-box; background: #000; border: 1px solid #333; color: #999; font-size: .85em; padding: 2px 4px;"});
			private readonly _pulseVolumeTextInput: HTMLInputElement = input({type: "text", style: "width: 100%; margin: 4px 0 0 0; box-sizing: border-box; background: #000; border: 1px solid #333; color: #999; font-size: .85em; padding: 2px 4px;"});
			private readonly _pulsePitchTextInput: HTMLInputElement = input({type: "text", style: "width: 100%; margin: 4px 0 0 0; box-sizing: border-box; background: #000; border: 1px solid #333; color: #999; font-size: .85em; padding: 2px 4px;"});
			private readonly _pulseHiPitchTextInput: HTMLInputElement = input({type: "text", style: "width: 100%; margin: 4px 0 0 0; box-sizing: border-box; background: #000; border: 1px solid #333; color: #999; font-size: .85em; padding: 2px 4px;"});
				private readonly _pulseDutyLabels: HTMLDivElement = (() => {
					const labels: Node[] = [];
					for (let i: number = Config.pulseWidthRange - 1; i >= 0; i--) {
						labels.push(span({style: "display: block;"}, [text(formatPercent(Config.getPulseWidthRatio(i)))]));
					}
				return div({style: "width: 3.1em; flex: 0 0 auto; padding-right: .55em; box-sizing: border-box; font-size: .7em; line-height: 1; color: #999; text-align: right; display: flex; flex-direction: column; justify-content: space-between;"}, labels);
			})();
			private readonly _pulseWidthRow: HTMLDivElement = div(
				{
					className: "selectRow",
					style: "height: auto; margin: .3em 0; flex-direction: column; align-items: stretch; justify-content: flex-start;",
				},
				[
					span({style: "margin-bottom: .35em;"}, [text("Duty Cycle:")]),
					div({style: "display: flex; flex-direction: column; align-items: stretch;"}, [
						div({style: "display: flex; flex-direction: row; align-items: stretch; height: 6.9em; min-height: 0;"}, [this._pulseDutyLabels, this._pulseWidthBox.container]),
						div({style: "display: flex; flex-direction: row; align-items: stretch;"}, [
							div({style: "width: 3.1em; flex: 0 0 auto; padding-right: .55em; box-sizing: border-box; font-size: .7em;"}),
							this._pulseDutyTextInput,
						]),
					]),
				],
			);
			private readonly _pulseVolumeRow: HTMLDivElement = div(
				{
					className: "selectRow",
					style: "height: auto; margin: .3em 0; flex-direction: column; align-items: stretch; justify-content: flex-start;",
				},
				[
					span({style: "margin-bottom: .35em;"}, [text("Volume:")]),
						div({style: "display: flex; flex-direction: column; align-items: stretch;"}, [
						div({style: "display: flex; flex-direction: row; align-items: stretch; height: 6.9em; min-height: 0;"}, [
							div({style: "width: 2.0em; flex: 0 0 auto; padding-right: .35em; box-sizing: border-box; font-size: .7em; line-height: 1; color: #999; text-align: right; display: flex; flex-direction: column; justify-content: space-between;"}, [
								span({}, [text(String(Config.pulseVolumeMax))]),
								span({}, [text("0")]),
							]),
							this._pulseVolumeBox.container,
						]),
						div({style: "display: flex; flex-direction: row; align-items: stretch;"}, [
							div({style: "width: 2.0em; flex: 0 0 auto; padding-right: .35em; box-sizing: border-box; font-size: .7em;"}),
							this._pulseVolumeTextInput,
						]),
					]),
				],
			);
			private readonly _pulsePitchRow: HTMLDivElement = div(
				{
					className: "selectRow",
					style: "height: auto; margin: .3em 0; flex-direction: column; align-items: stretch; justify-content: flex-start;",
				},
				[
					span({style: "margin-bottom: .35em;"}, [text("Pitch:")]),
					div({style: "display: flex; flex-direction: column; align-items: stretch;"}, [
						div({style: "display: flex; flex-direction: row; align-items: stretch; height: 6.9em; min-height: 0;"}, [
							div({style: "width: 2.0em; flex: 0 0 auto; padding-right: .35em; box-sizing: border-box; font-size: .7em; line-height: 1; color: #999; text-align: right; display: flex; flex-direction: column; justify-content: space-between;"}, [
								span({}, [text("+8")]),
								span({}, [text("0")]),
								span({}, [text("-8")]),
							]),
							this._pulsePitchBox.container,
						]),
						div({style: "display: flex; flex-direction: row; align-items: stretch;"}, [
							div({style: "width: 2.0em; flex: 0 0 auto; padding-right: .35em; box-sizing: border-box; font-size: .7em;"}),
							this._pulsePitchTextInput,
						]),
					]),
				],
			);
			private readonly _pulseHiPitchRow: HTMLDivElement = div(
				{
					className: "selectRow",
					style: "height: auto; margin: .3em 0; flex-direction: column; align-items: stretch; justify-content: flex-start;",
				},
				[
					span({style: "margin-bottom: .35em;"}, [text("Hi Pitch:")]),
					div({style: "display: flex; flex-direction: column; align-items: stretch;"}, [
						div({style: "display: flex; flex-direction: row; align-items: stretch; height: 6.9em; min-height: 0;"}, [
							div({style: "width: 2.0em; flex: 0 0 auto; padding-right: .35em; box-sizing: border-box; font-size: .7em; line-height: 1; color: #999; text-align: right; display: flex; flex-direction: column; justify-content: space-between;"}, [
								span({}, [text("+12")]),
								span({}, [text("0")]),
								span({}, [text("-12")]),
							]),
							this._pulseHiPitchBox.container,
						]),
						div({style: "display: flex; flex-direction: row; align-items: stretch;"}, [
							div({style: "width: 2.0em; flex: 0 0 auto; padding-right: .35em; box-sizing: border-box; font-size: .7em;"}),
							this._pulseHiPitchTextInput,
						]),
					]),
				],
			);
			private readonly _pulseStepsSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "1", max: String(Config.pulseStepsMax), value: String(Config.pulseStepsMax), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulseSteps(this._doc, newValue),
			);
			private readonly _pulseStepsValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulseStepsLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Steps:"), this._pulseStepsValue]);
			private readonly _pulseStepsRow: HTMLDivElement = div({className: "selectRow"}, [this._pulseStepsLabel, this._pulseStepsSlider.input]);
			private readonly _pulseDutyTickSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "0", max: String(Config.pulseTickMsOptions.length - 1), value: String(Config.pulseTickDefaultIndex), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulseDutyTick(this._doc, newValue),
			);
			private readonly _pulseDutyTickValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2.8em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulseDutyTickLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Rate:"), this._pulseDutyTickValue]);
			private readonly _pulseDutyTickRow: HTMLDivElement = div({className: "selectRow"}, [this._pulseDutyTickLabel, this._pulseDutyTickSlider.input]);
			private readonly _pulseVolumeStepsSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "1", max: String(Config.pulseStepsMax), value: String(Config.pulseStepsMax), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulseVolumeSteps(this._doc, newValue),
			);
			private readonly _pulseVolumeStepsValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulseVolumeStepsLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Steps:"), this._pulseVolumeStepsValue]);
			private readonly _pulseVolumeStepsRow: HTMLDivElement = div({className: "selectRow"}, [this._pulseVolumeStepsLabel, this._pulseVolumeStepsSlider.input]);
			private readonly _pulseVolumeTickSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "0", max: String(Config.pulseTickMsOptions.length - 1), value: String(Config.pulseTickDefaultIndex), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulseVolumeTick(this._doc, newValue),
			);
			private readonly _pulseVolumeTickValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2.8em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulseVolumeTickLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Rate:"), this._pulseVolumeTickValue]);
			private readonly _pulseVolumeTickRow: HTMLDivElement = div({className: "selectRow"}, [this._pulseVolumeTickLabel, this._pulseVolumeTickSlider.input]);
			private readonly _pulsePitchStepsSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "1", max: String(Config.pulseStepsMax), value: String(Config.pulseStepsMax), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulsePitchSteps(this._doc, newValue),
			);
			private readonly _pulsePitchStepsValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulsePitchStepsLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Steps:"), this._pulsePitchStepsValue]);
			private readonly _pulsePitchStepsRow: HTMLDivElement = div({className: "selectRow"}, [this._pulsePitchStepsLabel, this._pulsePitchStepsSlider.input]);
			private readonly _pulsePitchTickSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "0", max: String(Config.pulseTickMsOptions.length - 1), value: String(Config.pulseTickDefaultIndex), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulsePitchTick(this._doc, newValue),
			);
			private readonly _pulsePitchTickValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2.8em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulsePitchTickLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Rate:"), this._pulsePitchTickValue]);
			private readonly _pulsePitchTickRow: HTMLDivElement = div({className: "selectRow"}, [this._pulsePitchTickLabel, this._pulsePitchTickSlider.input]);
			private readonly _pulseHiPitchStepsSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "1", max: String(Config.pulseStepsMax), value: String(Config.pulseStepsMax), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulseHiPitchSteps(this._doc, newValue),
			);
			private readonly _pulseHiPitchStepsValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulseHiPitchStepsLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Steps:"), this._pulseHiPitchStepsValue]);
			private readonly _pulseHiPitchStepsRow: HTMLDivElement = div({className: "selectRow"}, [this._pulseHiPitchStepsLabel, this._pulseHiPitchStepsSlider.input]);
			private readonly _pulseHiPitchTickSlider: Slider = new Slider(
				input({style: "margin: 0px;", type: "range", min: "0", max: String(Config.pulseTickMsOptions.length - 1), value: String(Config.pulseTickDefaultIndex), step: "1"}),
				this._doc,
				(_oldValue: number, newValue: number) => new ChangePulseHiPitchTick(this._doc, newValue),
			);
			private readonly _pulseHiPitchTickValue: HTMLSpanElement = span({style: "position: absolute; left: 100%; margin-left: .15em; width: 2.8em; text-align: right; color: #999; pointer-events: none;"}, [text("")]);
			private readonly _pulseHiPitchTickLabel: HTMLSpanElement = span({style: "position: relative;"}, [text("Rate:"), this._pulseHiPitchTickValue]);
			private readonly _pulseHiPitchTickRow: HTMLDivElement = div({className: "selectRow"}, [this._pulseHiPitchTickLabel, this._pulseHiPitchTickSlider.input]);
			private readonly _transitionSelect: HTMLSelectElement = buildOptions(select({}), Config.transitionNames);
			private readonly _transitionSelectRow: HTMLDivElement = div({className: "selectRow"}, [
				span({}, [text("Transition: ")]),
				div({className: "selectContainer"}, [this._transitionSelect]),
			]);
			private readonly _typeAndVolumeGrid: HTMLDivElement = div({className: "instrument-settings-2x2"}, [
				div({style: "grid-column: 1; grid-row: 1;"}, [this._instrumentTypeSelectRow]),
				div({style: "grid-column: 2; grid-row: 1;"}, [this._instrumentVolumeSliderRow]),
			]);
			private readonly _pulseTransitionSelect: HTMLSelectElement = buildOptions(select({}), Config.transitionNames);
			private readonly _pulseTransitionSelectRow: HTMLDivElement = div({className: "selectRow"}, [
				span({}, [text("Transition: ")]),
				div({className: "selectContainer"}, [this._pulseTransitionSelect]),
			]);
			private readonly _pulseFilterSelect: HTMLSelectElement = buildOptions(select({}), Config.filterNames);
			private readonly _pulseFilterSelectRow: HTMLDivElement = div({className: "selectRow"}, [span({}, [text("Filter: ")]), div({className: "selectContainer"}, [this._pulseFilterSelect])]);
			private readonly _pulseChorusSelect: HTMLSelectElement = buildOptions(select({}), Config.chorusNames);
			private readonly _pulseChorusHint = <HTMLAnchorElement> html.element("a", {className: "hintButton"}, [text("?")]);
			private readonly _pulseChorusSelectRow: HTMLElement = div({className: "selectRow"}, [span({}, [text("Chorus: ")]), this._pulseChorusHint, div({className: "selectContainer"}, [this._pulseChorusSelect])]);
			private readonly _pulseEffectSelect: HTMLSelectElement = buildOptions(select({}), Config.effectNames);
			private readonly _pulseEffectSelectRow: HTMLElement = div({className: "selectRow"}, [span({}, [text("Effect: ")]), div({className: "selectContainer"}, [this._pulseEffectSelect])]);
				private readonly _pulseDutyCycleGrid: HTMLDivElement = div({className: "instrument-settings-2x2", style: "grid-template-rows: auto auto auto;"}, [
					div({style: "grid-column: 1; grid-row: 1; display: flex; flex-direction: column;"}, [
						this._pulseWaveSelectRow,
						this._pulseFilterSelectRow,
						this._pulseEffectSelectRow,
					]),
					div({style: "grid-column: 2; grid-row: 1; display: flex; flex-direction: column;"}, [
						this._pulseNesAccurateRow,
						this._pulseTransitionSelectRow,
						this._pulseChorusSelectRow,
					]),
					div({style: "grid-column: 1; grid-row: 2; display: flex; flex-direction: column;"}, [
						this._pulseVolumeRow,
						this._pulseVolumeStepsRow,
						this._pulseVolumeTickRow,
					]),
					div({style: "grid-column: 2; grid-row: 2; display: flex; flex-direction: column;"}, [
						this._pulseWidthRow,
						this._pulseStepsRow,
						this._pulseDutyTickRow,
					]),
					div({style: "grid-column: 1; grid-row: 3; display: flex; flex-direction: column;"}, [
						this._pulseHiPitchRow,
						this._pulseHiPitchStepsRow,
						this._pulseHiPitchTickRow,
					]),
					div({style: "grid-column: 2; grid-row: 3; display: flex; flex-direction: column;"}, [
						this._pulsePitchRow,
						this._pulsePitchStepsRow,
						this._pulsePitchTickRow,
					]),
				]);
		private readonly _filterSelect: HTMLSelectElement = buildOptions(select({}), Config.filterNames);
		private readonly _filterSelectRow: HTMLDivElement = div({className: "selectRow"}, [span({}, [text("Filter: ")]), div({className: "selectContainer"}, [this._filterSelect])]);
		private readonly _chorusSelect: HTMLSelectElement = buildOptions(select({}), Config.chorusNames);
		private readonly _chorusHint = <HTMLAnchorElement> html.element("a", {className: "hintButton"}, [text("?")]);
		private readonly _chorusSelectRow: HTMLElement = div({className: "selectRow"}, [span({}, [text("Chorus: ")]), this._chorusHint, div({className: "selectContainer"}, [this._chorusSelect])]);
		private readonly _effectSelect: HTMLSelectElement = buildOptions(select({}), Config.effectNames);
		private readonly _effectSelectRow: HTMLElement = div({className: "selectRow"}, [span({}, [text("Effect: ")]), div({className: "selectContainer"}, [this._effectSelect])]);
		private readonly _phaseModGroup: HTMLElement = div({style: "display: flex; flex-direction: column; display: none;"}, []);
		private readonly _feedbackTypeSelect: HTMLSelectElement = buildOptions(select({}), Config.operatorFeedbackNames);
		private readonly _feedbackRow1: HTMLDivElement = div({className: "selectRow"}, [span({}, [text("Feedback:")]), div({className: "selectContainer"}, [this._feedbackTypeSelect])]);
		
		private readonly _feedbackAmplitudeSlider: Slider = new Slider(input({style: "margin: 0px; width: 4em;", type: "range", min: "0", max: Config.operatorAmplitudeMax, value: "0", step: "1", title: "Feedback Amplitude"}), this._doc, (oldValue: number, newValue: number) => new ChangeFeedbackAmplitude(this._doc, oldValue, newValue));
		private readonly _feedbackEnvelopeSelect: HTMLSelectElement = buildOptions(select({style: "width: 100%;", title: "Feedback Envelope"}), Config.operatorEnvelopeNames);
		private readonly _feedbackRow2: HTMLDivElement = div({className: "operatorRow"}, [
			div({style: "margin-right: .1em; visibility: hidden;"}, [text(1 + ".")]),
			div({style: "width: 3em; margin-right: .3em;"}),
			this._feedbackAmplitudeSlider.input,
			div({className: "selectContainer", style: "width: 5em; margin-left: .3em;"}, [this._feedbackEnvelopeSelect]),
		]);
			private readonly _instrumentSettingsGroup: HTMLDivElement = div({className: "instrument-settings-grid"}, [
				this._instrumentSelectRow,
				this._typeAndVolumeGrid,
				this._pulseDutyCycleGrid,
				this._waveSelectRow,
				this._transitionSelectRow,
			this._filterSelectRow,
			this._chorusSelectRow,
			this._effectSelectRow,
			this._algorithmSelectRow,
			this._phaseModGroup,
			this._feedbackRow1,
			this._feedbackRow2,
		]);
		private readonly _promptContainer: HTMLDivElement = div({className: "promptContainer", style: "display: none;"});
		public readonly mainLayer: HTMLDivElement = div({className: "beepboxEditor", tabIndex: "0"}, [
			this._patternArea,
			div({className: "editor-widget-column settings-area"}, [
				div({className: "version-area", style: "text-align: center; color: #999;"}, [text("ChippedBox (Alpha)")]),
				div({className: "editor-widgets"}, [
					div({className: "editor-controls"}, [
						div({className: "playback-controls play-pause-area"}, [
							div({className: "playback-bar-controls"}, [
								this._playButton,
								this._prevBarButton,
								this._nextBarButton,
							]),
							div({className: "playback-volume-controls"}, [
								// Volume speaker icon:
								svgElement("svg", {style: "flex-shrink: 0;", width: "2em", height: "2em", viewBox: "0 0 26 26"}, [
									svgElement("path", {d: "M 4 16 L 4 10 L 8 10 L 13 5 L 13 21 L 8 16 z M 15 11 L 16 10 A 7.2 7.2 0 0 1 16 16 L 15 15 A 5.8 5.8 0 0 0 15 12 z M 18 8 L 19 7 A 11.5 11.5 0 0 1 19 19 L 18 18 A 10.1 10.1 0 0 0 18 8 z", fill: "#777"}),
								]),
								this._volumeSlider,
							]),
						]),
						div({className: "editor-menus menu-area"}, [
							this._newSongButton,
							div({className: "selectContainer menu"}, [
								this._editMenu,
								// Edit icon:
								svgElement("svg", {style: "flex-shrink: 0; position: absolute; left: 0; top: 50%; margin-top: -1em; pointer-events: none;", width: "2em", height: "2em", viewBox: "-5 -21 26 26"}, [
									svgElement("path", {d: "M 0 0 L 1 -4 L 4 -1 z M 2 -5 L 10 -13 L 13 -10 L 5 -2 zM 11 -14 L 13 -16 L 14 -16 L 16 -14 L 16 -13 L 14 -11 z", fill: "currentColor"}),
								]),
							]),
							div({className: "selectContainer menu"}, [
								this._optionsMenu,
								// Gear icon:
								svgElement("svg", {style: "flex-shrink: 0; position: absolute; left: 0; top: 50%; margin-top: -1em; pointer-events: none;", width: "2em", height: "2em", viewBox: "-13 -13 26 26"}, [
									svgElement("path", {d: "M 5.78 -1.6 L 7.93 -0.94 L 7.93 0.94 L 5.78 1.6 L 4.85 3.53 L 5.68 5.61 L 4.21 6.78 L 2.36 5.52 L 0.27 5.99 L -0.85 7.94 L -2.68 7.52 L -2.84 5.28 L -4.52 3.95 L -6.73 4.28 L -7.55 2.59 L -5.9 1.07 L -5.9 -1.07 L -7.55 -2.59 L -6.73 -4.28 L -4.52 -3.95 L -2.84 -5.28 L -2.68 -7.52 L -0.85 -7.94 L 0.27 -5.99 L 2.36 -5.52 L 4.21 -6.78 L 5.68 -5.61 L 4.85 -3.53 M 2.92 0.67 L 2.92 -0.67 L 2.35 -1.87 L 1.3 -2.7 L 0 -3 L -1.3 -2.7 L -2.35 -1.87 L -2.92 -0.67 L -2.92 0.67 L -2.35 1.87 L -1.3 2.7 L -0 3 L 1.3 2.7 L 2.35 1.87 z", fill: "currentColor"}),
								]),
							]),
							this._exportButton,
						]),
					]),
					div({className: "editor-settings"}, [
						div({className: "editor-song-settings song-settings-area"}, [
							div({style: "margin: 3px 0; text-align: center; color: #999;"}, [
								text("Song Settings")
							]),
							div({className: "selectRow"}, [
								span({}, [text("Scale: ")]),
								div({className: "selectContainer"}, [this._scaleSelect]),
							]),
							div({className: "selectRow"}, [
								span({}, [text("Key: ")]),
								div({className: "selectContainer"}, [this._keySelect]),
							]),
							div({className: "selectRow"}, [
								span({}, [text("Tempo: ")]),
								this._tempoSlider.input,
							]),
							div({className: "selectRow"}, [
								span({}, [text("Reverb: ")]),
								this._reverbSlider.input,
							]),
							div({className: "selectRow"}, [
								span({}, [text("Rhythm: ")]),
								div({className: "selectContainer"}, [this._partSelect]),
							]),
						]),
						div({className: "editor-instrument-settings instrument-settings-area"}, [
							div({style: "margin: 3px 0; text-align: center; color: #999;"}, [
								text("Instrument Settings")
							]),
							this._instrumentSettingsGroup,
						]),
					]),
				]),
			]),
			this._trackArea,
			this._promptContainer,
		]);
		
		private _wasPlaying: boolean;
		private _changeTranspose: ChangeTranspose | null = null;
		private readonly _operatorRows: HTMLDivElement[] = []
		private readonly _operatorAmplitudeSliders: Slider[] = []
		private readonly _operatorEnvelopeSelects: HTMLSelectElement[] = []
		private readonly _operatorFrequencySelects: HTMLSelectElement[] = []
		
		private static _formatSequence(sequence: ReadonlyArray<number>, steps: number): string {
			const parts: string[] = [];
			for (let i: number = 0; i < steps; i++) parts.push(String(sequence[i] | 0));
			return parts.join(" ");
		}

		private static _formatPulsePitchSequence(sequence: ReadonlyArray<number>, steps: number): string {
			const parts: string[] = [];
			for (let i: number = 0; i < steps; i++) {
				parts.push(String((sequence[i] | 0) - Config.pulsePitchCenter));
			}
			return parts.join(" ");
		}

		private static _formatPulseHiPitchSequence(sequence: ReadonlyArray<number>, steps: number): string {
			const parts: string[] = [];
			for (let i: number = 0; i < steps; i++) {
				parts.push(String((sequence[i] | 0) - Config.pulseHiPitchCenter));
			}
			return parts.join(" ");
		}
		
		private static _applySequenceText(existing: ReadonlyArray<number>, steps: number, maxValue: number, text: string): number[] | null {
			const matches: RegExpMatchArray | null = text.match(/-?\d+/g);
			if (matches == null) return null;
			const next: number[] = existing.slice();
			const count: number = Math.min(steps, matches.length);
			for (let i: number = 0; i < count; i++) {
				let value: number = parseInt(matches[i], 10);
				if (isNaN(value)) continue;
				if (value < 0) value = 0;
				if (value > maxValue) value = maxValue;
				next[i] = value;
			}
			return next;
		}
		
		private _stopTextInputKeyHandling = (event: KeyboardEvent): void => {
			// Prevent editor-wide hotkeys (space to play, number keys, etc.) from triggering while typing.
			event.stopPropagation();
			if (event.key == "Enter") {
				event.preventDefault();
				(<HTMLInputElement> event.target).blur();
			}
		}
		
		private _stopMousePropagation = (event: MouseEvent): void => {
			event.stopPropagation();
		}
		
		private _stopTouchPropagation = (event: TouchEvent): void => {
			event.stopPropagation();
		}
		
		private _whenPulseDutyTextBlur = (): void => {
			this._doc.record(new ChangePulseDutyText(this._doc, this._pulseDutyTextInput.value));
			this.whenUpdated();
		}
		
		private _whenPulseVolumeTextBlur = (): void => {
			this._doc.record(new ChangePulseVolumeText(this._doc, this._pulseVolumeTextInput.value));
			this.whenUpdated();
		}

		private _whenPulsePitchTextBlur = (): void => {
			this._doc.record(new ChangePulsePitchText(this._doc, this._pulsePitchTextInput.value));
			this.whenUpdated();
		}

		private _whenPulseHiPitchTextBlur = (): void => {
			this._doc.record(new ChangePulseHiPitchText(this._doc, this._pulseHiPitchTextInput.value));
			this.whenUpdated();
		}
		
		private _whenSetPulseNesAccurate = (): void => {
			this._doc.record(new ChangePulseNesAccurate(this._doc, this._pulseNesAccurateCheckbox.checked));
		}

		private _whenSetPulseWaveform = (): void => {
			this._doc.record(new ChangePulseWaveform(this._doc, this._pulseWaveSelect.selectedIndex));
		}
		
		constructor(private _doc: SongDocument) {
			this._doc.notifier.watch(this.whenUpdated);
			
			this._phaseModGroup.appendChild(div({className: "operatorRow", style: "color: #999; height: 1em; margin-top: 0.5em;"}, [
				div({style: "margin-right: .1em; visibility: hidden;"}, [text(1 + ".")]),
				div({style: "width: 3em; margin-right: .3em;"}, [text("Freq:")]),
				div({style: "width: 4em; margin: 0;"}, [text("Volume:")]),
				div({style: "width: 5em; margin-left: .3em;"}, [text("Envelope:")]),
			]));
			for (let i = 0; i < Config.operatorCount; i++) {
				const operatorIndex: number = i;
				const operatorNumber: HTMLDivElement = div({style: "margin-right: .1em; color: #999;"}, [text(i + 1 + ".")]);
				const frequencySelect: HTMLSelectElement = buildOptions(select({style: "width: 100%;", title: "Frequency"}), Config.operatorFrequencyNames);
				const amplitudeSlider: Slider = new Slider(input({style: "margin: 0; width: 4em;", type: "range", min: "0", max: Config.operatorAmplitudeMax, value: "0", step: "1", title: "Volume"}), this._doc, (oldValue: number, newValue: number) => new ChangeOperatorAmplitude(this._doc, operatorIndex, oldValue, newValue));
				const envelopeSelect: HTMLSelectElement = buildOptions(select({style: "width: 100%;", title: "Envelope"}), Config.operatorEnvelopeNames);
				const row = div({className: "operatorRow"}, [
					operatorNumber,
					div({className: "selectContainer", style: "width: 3em; margin-right: .3em;"}, [frequencySelect]),
					amplitudeSlider.input,
					div({className: "selectContainer", style: "width: 5em; margin-left: .3em;"}, [envelopeSelect]),
				]);
				this._phaseModGroup.appendChild(row);
				this._operatorRows[i] = row;
				this._operatorAmplitudeSliders[i] = amplitudeSlider;
				this._operatorEnvelopeSelects[i] = envelopeSelect;
				this._operatorFrequencySelects[i] = frequencySelect;
				
				envelopeSelect.addEventListener("change", () => {
					this._doc.record(new ChangeOperatorEnvelope(this._doc, operatorIndex, envelopeSelect.selectedIndex));
				});
				frequencySelect.addEventListener("change", () => {
					this._doc.record(new ChangeOperatorFrequency(this._doc, operatorIndex, frequencySelect.selectedIndex));
				});
			}
			
			this._editMenu.addEventListener("change", this._editMenuHandler);
			this._optionsMenu.addEventListener("change", this._optionsMenuHandler);
			this._scaleSelect.addEventListener("change", this._whenSetScale);
			this._keySelect.addEventListener("change", this._whenSetKey);
			this._partSelect.addEventListener("change", this._whenSetPartsPerBeat);
			this._instrumentTypeSelect.addEventListener("change", this._whenSetInstrumentType);
			this._algorithmSelect.addEventListener("change", this._whenSetAlgorithm);
			this._instrumentSelect.addEventListener("change", this._whenSetInstrument);
			this._feedbackTypeSelect.addEventListener("change", this._whenSetFeedbackType);
			this._feedbackEnvelopeSelect.addEventListener("change", this._whenSetFeedbackEnvelope);
			this._waveSelect.addEventListener("change", this._whenSetWave);
			this._drumSelect.addEventListener("change", this._whenSetDrum);
			this._transitionSelect.addEventListener("change", this._whenSetTransition);
			this._filterSelect.addEventListener("change", this._whenSetFilter);
			this._chorusSelect.addEventListener("change", this._whenSetChorus);
			this._effectSelect.addEventListener("change", this._whenSetEffect);
			this._pulseTransitionSelect.addEventListener("change", this._whenSetPulseTransition);
			this._pulseFilterSelect.addEventListener("change", this._whenSetPulseFilter);
			this._pulseChorusSelect.addEventListener("change", this._whenSetPulseChorus);
			this._pulseEffectSelect.addEventListener("change", this._whenSetPulseEffect);
			this._pulseWaveSelect.addEventListener("change", this._whenSetPulseWaveform);
			this._pulseNesAccurateCheckbox.addEventListener("change", this._whenSetPulseNesAccurate);
			this._pulseDutyTextInput.addEventListener("keydown", this._stopTextInputKeyHandling);
			this._pulseDutyTextInput.addEventListener("mousedown", this._stopMousePropagation);
			this._pulseDutyTextInput.addEventListener("touchstart", this._stopTouchPropagation, {passive: false});
			this._pulseDutyTextInput.addEventListener("blur", this._whenPulseDutyTextBlur);
			this._pulseVolumeTextInput.addEventListener("keydown", this._stopTextInputKeyHandling);
			this._pulseVolumeTextInput.addEventListener("mousedown", this._stopMousePropagation);
			this._pulseVolumeTextInput.addEventListener("touchstart", this._stopTouchPropagation, {passive: false});
			this._pulseVolumeTextInput.addEventListener("blur", this._whenPulseVolumeTextBlur);
			this._pulsePitchTextInput.addEventListener("keydown", this._stopTextInputKeyHandling);
			this._pulsePitchTextInput.addEventListener("mousedown", this._stopMousePropagation);
			this._pulsePitchTextInput.addEventListener("touchstart", this._stopTouchPropagation, {passive: false});
			this._pulsePitchTextInput.addEventListener("blur", this._whenPulsePitchTextBlur);
			this._pulseHiPitchTextInput.addEventListener("keydown", this._stopTextInputKeyHandling);
			this._pulseHiPitchTextInput.addEventListener("mousedown", this._stopMousePropagation);
			this._pulseHiPitchTextInput.addEventListener("touchstart", this._stopTouchPropagation, {passive: false});
			this._pulseHiPitchTextInput.addEventListener("blur", this._whenPulseHiPitchTextBlur);
			this._playButton.addEventListener("click", this._togglePlay);
			this._prevBarButton.addEventListener("click", this._whenPrevBarPressed);
			this._nextBarButton.addEventListener("click", this._whenNextBarPressed);
			this._newSongButton.addEventListener("click", this._whenNewSongPressed);
			this._exportButton.addEventListener("click", this._openExportPrompt);
			this._volumeSlider.addEventListener("input", this._setVolumeSlider);
			this._instrumentTypeHint.addEventListener("click", this._openInstrumentTypePrompt);
			this._chorusHint.addEventListener("click", this._openChorusPrompt);
			
			this._patternArea.addEventListener("mousedown", this._refocusStage);
			this.mainLayer.addEventListener("keydown", this._whenKeyPressed);
			window.addEventListener("resize", this.whenUpdated);
			
			if (isMobile) (<HTMLOptionElement> this._optionsMenu.children[1]).disabled = true;
		}
		
		private _openPrompt(promptName: string): void {
			this._doc.openPrompt(promptName);
			this._setPrompt(promptName);
		}
		
		private _setPrompt(promptName: string | null): void {
			if (this.prompt) {
				if (this._wasPlaying) this._play();
				this._wasPlaying = false;
				this._promptContainer.style.display = "none";
				this._promptContainer.removeChild(this.prompt.container);
				this.prompt.cleanUp();
				this.prompt = null;
				this.mainLayer.focus();
			}
			
			if (promptName) {
				switch (promptName) {
					case "export":
						this.prompt = new ExportPrompt(this._doc, this);
						break;
					case "import":
						this.prompt = new ImportPrompt(this._doc, this);
						break;
					case "duration":
						this.prompt = new SongDurationPrompt(this._doc, this);
						break;
					case "instrumentType":
						this.prompt = new InstrumentTypePrompt(this._doc, this);
						break;
					case "chorus":
						this.prompt = new ChorusPrompt(this._doc, this);
						break;
					default:
						throw new Error("Unrecognized prompt type.");
				}
				
					if (this.prompt) {
						this._wasPlaying = this._doc.synth.playing;
						this._pause();
						this._promptContainer.style.display = "";
						this._promptContainer.appendChild(this.prompt.container);
					}
				}
		}
		
		private _refocusStage = (): void => {
			this.mainLayer.focus();
		}
		
		public whenUpdated = (): void => {
			const trackBounds = this._trackContainer.getBoundingClientRect();
			this._doc.trackVisibleBars = Math.floor((trackBounds.right - trackBounds.left) / 32);
			this._barScrollBar.render();
			this._trackEditor.render();
			
			const optionCommands: ReadonlyArray<string> = [
				(this._doc.autoPlay ? "✓ " : "") + "Auto Play On Load",
				(this._doc.autoFollow ? "✓ " : "") + "Auto Follow Track",
				(this._doc.showLetters ? "✓ " : "") + "Show Piano",
				(this._doc.showFifth ? "✓ " : "") + "Highlight 'Fifth' Notes",
				(this._doc.showChannels ? "✓ " : "") + "Show All Channels",
				(this._doc.showScrollBar ? "✓ " : "") + "Octave Scroll Bar",
			]
			for (let i: number = 0; i < optionCommands.length; i++) {
				const option: HTMLOptionElement = <HTMLOptionElement> this._optionsMenu.children[i + 1];
				if (option.innerText != optionCommands[i]) option.innerText = optionCommands[i];
			}
			
			const channel: Channel = this._doc.song.channels[this._doc.channel];
				const pattern: Pattern | null = this._doc.getCurrentPattern();
				const instrumentIndex: number = this._doc.getCurrentInstrument();
				const instrument: Instrument = channel.instruments[instrumentIndex];
				const wasActive: boolean = this.mainLayer.contains(document.activeElement);
				const activeElement: Element | null = document.activeElement;
			
			setSelectedIndex(this._scaleSelect, this._doc.song.scale);
			setSelectedIndex(this._keySelect, this._doc.song.key);
			this._tempoSlider.updateValue(this._doc.song.tempo);
			this._tempoSlider.input.title = this._doc.song.getBeatsPerMinute() + " beats per minute";
			this._reverbSlider.updateValue(this._doc.song.reverb);
			setSelectedIndex(this._partSelect, Config.partCounts.indexOf(this._doc.song.partsPerBeat));
				if (this._doc.song.getChannelIsDrum(this._doc.channel)) {
					this._instrumentVolumeSliderRow.style.display = "";
					this._drumSelect.style.display = "";
					this._waveSelectRow.style.display = "";
					this._pulseWaveSelectRow.style.display = "none";
					this._pulseNesAccurateRow.style.display = "none";
					this._pulseDutyCycleGrid.style.display = "none";
					this._pulseWidthRow.style.display = "none";
					this._pulseVolumeRow.style.display = "none";
					this._pulseVolumeStepsRow.style.display = "none";
					this._pulseVolumeTickRow.style.display = "none";
					this._pulsePitchRow.style.display = "none";
					this._pulsePitchStepsRow.style.display = "none";
					this._pulsePitchTickRow.style.display = "none";
					this._pulseHiPitchRow.style.display = "none";
					this._pulseHiPitchStepsRow.style.display = "none";
					this._pulseHiPitchTickRow.style.display = "none";
					this._pulseStepsRow.style.display = "none";
					this._pulseDutyTickRow.style.display = "none";
					this._instrumentTypeSelectRow.style.display = "none";
					this._algorithmSelectRow.style.display = "none";
					this._phaseModGroup.style.display = "none";
					this._feedbackRow1.style.display = "none";
				this._feedbackRow2.style.display = "none";
				this._waveSelect.style.display = "none";
				this._filterSelectRow.style.display = "none";
				this._chorusSelectRow.style.display = "none";
				this._effectSelectRow.style.display = "none";
			} else {
				this._instrumentTypeSelectRow.style.display = "";
				this._effectSelectRow.style.display = "";
				this._drumSelect.style.display = "none";
				
					if (instrument.type == InstrumentType.chip) {
						this._instrumentVolumeSliderRow.style.display = "";
						this._waveSelect.style.display = "";
						this._waveSelectRow.style.display = "";
						this._pulseWaveSelectRow.style.display = "none";
						this._pulseNesAccurateRow.style.display = "none";
						this._pulseDutyCycleGrid.style.display = "none";
						this._pulseWidthRow.style.display = "none";
						this._pulseVolumeRow.style.display = "none";
						this._pulseVolumeStepsRow.style.display = "none";
						this._pulseVolumeTickRow.style.display = "none";
						this._pulsePitchRow.style.display = "none";
						this._pulsePitchStepsRow.style.display = "none";
						this._pulsePitchTickRow.style.display = "none";
						this._pulseHiPitchRow.style.display = "none";
						this._pulseHiPitchStepsRow.style.display = "none";
						this._pulseHiPitchTickRow.style.display = "none";
						this._pulseStepsRow.style.display = "none";
						this._pulseDutyTickRow.style.display = "none";
						this._transitionSelectRow.style.display = "";
						this._filterSelectRow.style.display = "";
						this._chorusSelectRow.style.display = "";
						this._algorithmSelectRow.style.display = "none";
						this._phaseModGroup.style.display = "none";
					this._feedbackRow1.style.display = "none";
					this._feedbackRow2.style.display = "none";
					} else if (instrument.type == InstrumentType.pulse) {
						this._instrumentVolumeSliderRow.style.display = "";
						this._waveSelectRow.style.display = "none";
						this._pulseWaveSelectRow.style.display = "";
						this._pulseNesAccurateRow.style.display = "";
						this._pulseDutyCycleGrid.style.display = "";
						const isTriangle: boolean = (instrument.pulseWaveform == 1);
						this._pulseWidthRow.style.display = "";
						this._pulseStepsRow.style.display = "";
						this._pulseVolumeRow.style.display = "";
						this._pulseVolumeStepsRow.style.display = "";
						this._pulseVolumeTickRow.style.display = "";
						this._pulsePitchRow.style.display = "";
						this._pulsePitchStepsRow.style.display = "";
						this._pulsePitchTickRow.style.display = "";
						this._pulseHiPitchRow.style.display = "";
						this._pulseHiPitchStepsRow.style.display = "";
						this._pulseHiPitchTickRow.style.display = "";
						this._pulseDutyTickRow.style.display = "";
						this._pulseWidthBox.setEnabled(!isTriangle);
						this._pulseDutyTextInput.disabled = isTriangle;
						this._pulseStepsSlider.input.disabled = isTriangle;
						this._pulseDutyTickSlider.input.disabled = isTriangle;
						this._transitionSelectRow.style.display = "none";
						this._filterSelectRow.style.display = "none";
						this._chorusSelectRow.style.display = "none";
						this._effectSelectRow.style.display = "none";
						this._algorithmSelectRow.style.display = "none";
						this._phaseModGroup.style.display = "none";
					this._feedbackRow1.style.display = "none";
					this._feedbackRow2.style.display = "none";
					} else {
						this._algorithmSelectRow.style.display = "";
						this._phaseModGroup.style.display = "";
						this._feedbackRow1.style.display = "";
						this._feedbackRow2.style.display = "";
						this._instrumentVolumeSliderRow.style.display = "none";
						this._waveSelectRow.style.display = "none";
						this._pulseWaveSelectRow.style.display = "none";
						this._pulseNesAccurateRow.style.display = "none";
						this._pulseDutyCycleGrid.style.display = "none";
						this._pulseWidthRow.style.display = "none";
						this._pulseVolumeRow.style.display = "none";
						this._pulseVolumeStepsRow.style.display = "none";
						this._pulseVolumeTickRow.style.display = "none";
						this._pulsePitchRow.style.display = "none";
						this._pulsePitchStepsRow.style.display = "none";
						this._pulsePitchTickRow.style.display = "none";
						this._pulseHiPitchRow.style.display = "none";
						this._pulseHiPitchStepsRow.style.display = "none";
						this._pulseHiPitchTickRow.style.display = "none";
						this._pulseStepsRow.style.display = "none";
						this._pulseDutyTickRow.style.display = "none";
						this._transitionSelectRow.style.display = "";
						this._filterSelectRow.style.display = "none";
						this._chorusSelectRow.style.display = "none";
						this._effectSelectRow.style.display = "";
					}
				}
			
			const instrumentTypeOptionIndex: number = Config.pitchChannelTypeValues.indexOf(instrument.type);
			setSelectedIndex(this._instrumentTypeSelect, instrumentTypeOptionIndex == -1 ? 0 : instrumentTypeOptionIndex);
			setSelectedIndex(this._algorithmSelect, instrument.algorithm);
			
			this._instrumentSelectRow.style.display = (this._doc.song.instrumentsPerChannel > 1) ? "" : "none";
			this._instrumentSelectRow.style.visibility = (pattern == null) ? "hidden" : "";
			if (this._instrumentSelect.children.length != this._doc.song.instrumentsPerChannel) {
				while (this._instrumentSelect.firstChild) this._instrumentSelect.removeChild(this._instrumentSelect.firstChild);
				const instrumentList: number[] = [];
				for (let i: number = 0; i < this._doc.song.instrumentsPerChannel; i++) {
					instrumentList.push(i + 1);
				}
				buildOptions(this._instrumentSelect, instrumentList);
			}
			
			this._instrumentSettingsGroup.style.color = this._doc.song.getNoteColorBright(this._doc.channel);
			
				setSelectedIndex(this._waveSelect, instrument.wave);
				setSelectedIndex(this._drumSelect, instrument.wave);
				setSelectedIndex(this._pulseWaveSelect, instrument.pulseWaveform);
				this._pulseNesAccurateCheckbox.checked = instrument.pulseNesAccurate;
				this._pulseWidthBox.render(instrument.pulseSequence, this._doc.song.getNoteColorBright(this._doc.channel));
				this._pulseVolumeBox.render(instrument.pulseVolumeSequence, this._doc.song.getNoteColorBright(this._doc.channel));
				this._pulsePitchBox.render(instrument.pulsePitchSequence, this._doc.song.getNoteColorBright(this._doc.channel));
				this._pulseHiPitchBox.render(instrument.pulseHiPitchSequence, this._doc.song.getNoteColorBright(this._doc.channel));
				this._pulseStepsSlider.updateValue(instrument.pulseSteps);
				this._pulseStepsValue.textContent = String(instrument.pulseSteps);
				this._pulseDutyTickSlider.updateValue(instrument.pulseDutyTick);
				this._pulseDutyTickValue.textContent = (Config.pulseTickMsOptions[instrument.pulseDutyTick | 0] || Config.pulseTickMsDefault) + "ms";
				this._pulseVolumeStepsSlider.updateValue(instrument.pulseVolumeSteps);
				this._pulseVolumeStepsValue.textContent = String(instrument.pulseVolumeSteps);
				this._pulseVolumeTickSlider.updateValue(instrument.pulseVolumeTick);
				this._pulseVolumeTickValue.textContent = (Config.pulseTickMsOptions[instrument.pulseVolumeTick | 0] || Config.pulseTickMsDefault) + "ms";
				this._pulsePitchStepsSlider.updateValue(instrument.pulsePitchSteps);
				this._pulsePitchStepsValue.textContent = String(instrument.pulsePitchSteps);
				this._pulsePitchTickSlider.updateValue(instrument.pulsePitchTick);
				this._pulsePitchTickValue.textContent = (Config.pulseTickMsOptions[instrument.pulsePitchTick | 0] || Config.pulseTickMsDefault) + "ms";
				this._pulseHiPitchStepsSlider.updateValue(instrument.pulseHiPitchSteps);
				this._pulseHiPitchStepsValue.textContent = String(instrument.pulseHiPitchSteps);
				this._pulseHiPitchTickSlider.updateValue(instrument.pulseHiPitchTick);
				this._pulseHiPitchTickValue.textContent = (Config.pulseTickMsOptions[instrument.pulseHiPitchTick | 0] || Config.pulseTickMsDefault) + "ms";
				if (document.activeElement != this._pulseDutyTextInput) this._pulseDutyTextInput.value = SongEditor._formatSequence(instrument.pulseSequence, instrument.pulseSteps);
				if (document.activeElement != this._pulseVolumeTextInput) this._pulseVolumeTextInput.value = SongEditor._formatSequence(instrument.pulseVolumeSequence, instrument.pulseVolumeSteps);
				if (document.activeElement != this._pulsePitchTextInput) this._pulsePitchTextInput.value = SongEditor._formatPulsePitchSequence(instrument.pulsePitchSequence, instrument.pulsePitchSteps);
				if (document.activeElement != this._pulseHiPitchTextInput) this._pulseHiPitchTextInput.value = SongEditor._formatPulseHiPitchSequence(instrument.pulseHiPitchSequence, instrument.pulseHiPitchSteps);
				setSelectedIndex(this._filterSelect, instrument.filter);
			setSelectedIndex(this._transitionSelect, instrument.transition);
			setSelectedIndex(this._effectSelect, instrument.effect);
			setSelectedIndex(this._chorusSelect, instrument.chorus);
			setSelectedIndex(this._pulseTransitionSelect, instrument.transition);
			setSelectedIndex(this._pulseFilterSelect, instrument.filter);
			setSelectedIndex(this._pulseChorusSelect, instrument.chorus);
			setSelectedIndex(this._pulseEffectSelect, instrument.effect);
			setSelectedIndex(this._feedbackTypeSelect, instrument.feedbackType);
			this._feedbackAmplitudeSlider.updateValue(instrument.feedbackAmplitude);
			setSelectedIndex(this._feedbackEnvelopeSelect, instrument.feedbackEnvelope);
			this._feedbackEnvelopeSelect.parentElement!.style.color = (instrument.feedbackAmplitude > 0) ? "" : "#999";
			this._instrumentVolumeSlider.updateValue(-instrument.volume);
			setSelectedIndex(this._instrumentSelect, instrumentIndex);
			for (let i: number = 0; i < Config.operatorCount; i++) {
				const isCarrier: boolean = (i < Config.operatorCarrierCounts[instrument.algorithm]);
				this._operatorRows[i].style.color = isCarrier ? "white" : "";
				setSelectedIndex(this._operatorFrequencySelects[i], instrument.operators[i].frequency);
				this._operatorAmplitudeSliders[i].updateValue(instrument.operators[i].amplitude);
				setSelectedIndex(this._operatorEnvelopeSelects[i], instrument.operators[i].envelope);
				const operatorName: string = (isCarrier ? "Voice " : "Modulator ") + (i + 1);
				this._operatorFrequencySelects[i].title = operatorName + " Frequency";
				this._operatorAmplitudeSliders[i].input.title = operatorName + (isCarrier ? " Volume" : " Amplitude");
				this._operatorEnvelopeSelects[i].title = operatorName + " Envelope";
				this._operatorEnvelopeSelects[i].parentElement!.style.color = (instrument.operators[i].amplitude > 0) ? "" : "#999";
			}
			
			this._piano.container.style.display = this._doc.showLetters ? "" : "none";
			this._octaveScrollBar.container.style.display = this._doc.showScrollBar ? "" : "none";
			this._barScrollBar.container.style.display = this._doc.song.barCount > this._doc.trackVisibleBars ? "" : "none";
			this._instrumentTypeHint.style.display = (instrument.type == InstrumentType.fm) ? "" : "none";
			this._chorusHint.style.display = (Config.chorusHarmonizes[instrument.chorus]) ? "" : "none";
			
			const patternRowWidth: number = this._patternEditorRow.clientWidth || 1024;
			const semitoneHeight: number = this._patternEditorRow.clientHeight / this._doc.getVisiblePitchCount();
			const targetBeatWidth: number = semitoneHeight * 5;
			const maxBeatWidth: number = Math.max(1, patternRowWidth / (this._doc.song.beatsPerBar * 3));
			const beatWidth: number = Math.min(targetBeatWidth, maxBeatWidth);
			const patternWidth: number = Math.max(1, Math.floor(beatWidth * this._doc.song.beatsPerBar));
			this._patternEditorPrev.container.style.width = String(patternWidth) + "px";
			this._patternEditor.container.style.width = String(patternWidth) + "px";
			this._patternEditorNext.container.style.width = String(patternWidth) + "px";
			this._patternEditorPrev.container.style.flexShrink = "0";
			this._patternEditor.container.style.flexShrink = "0";
			this._patternEditorNext.container.style.flexShrink = "0";
			this._patternEditorPrev.container.style.display = "";
			this._patternEditorNext.container.style.display = "";
			this._patternEditorPrev.render();
			this._patternEditor.render();
			this._patternEditorNext.render();
			
			this._volumeSlider.value = String(this._doc.volume);
			
			// If an interface element was selected, but becomes invisible (e.g. an instrument
			// select menu) just select the editor container so keyboard commands still work.
				if (wasActive && activeElement != null && (activeElement.clientWidth == 0)) {
					this._refocusStage();
				}
			
			this._setPrompt(this._doc.prompt);
			
			if (this._doc.autoFollow && !this._doc.synth.playing) {
				this._doc.synth.snapToBar(this._doc.bar);
			}
		}
		
		public updatePlayButton(): void {
			if (this._doc.synth.playing) {
				this._playButton.classList.remove("playButton");
				this._playButton.classList.add("pauseButton");
				this._playButton.title = "Pause (Space)";
				this._playButton.innerText = "Pause";
			} else {
				this._playButton.classList.remove("pauseButton");
				this._playButton.classList.add("playButton");
				this._playButton.title = "Play (Space)";
				this._playButton.innerText = "Play";
			}
		}
		
		private _whenKeyPressed = (event: KeyboardEvent): void => {
			if (this.prompt) {
				if (event.keyCode == 27) { // ESC key
					// close prompt.
					window.history.back();
				}
				return;
			}
			
			this._trackEditor.onKeyPressed(event);
			//if (event.ctrlKey)
			//trace(event.keyCode)
			switch (event.keyCode) {
				case 32: // space
					//stage.focus = stage;
					this._togglePlay();
					event.preventDefault();
					break;
				case 90: // z
					if (event.shiftKey) {
						this._doc.redo();
					} else {
						this._doc.undo();
					}
					event.preventDefault();
					break;
				case 89: // y
					this._doc.redo();
					event.preventDefault();
					break;
				case 67: // c
					this._copy();
					event.preventDefault();
					break;
				case 86: // v
					this._paste();
					event.preventDefault();
					break;
				case 219: // left brace
					this._doc.synth.prevBar();
					if (this._doc.autoFollow) {
						new ChangeChannelBar(this._doc, this._doc.channel, Math.floor(this._doc.synth.playhead));
					}
					event.preventDefault();
					break;
				case 221: // right brace
					this._doc.synth.nextBar();
					if (this._doc.autoFollow) {
						new ChangeChannelBar(this._doc, this._doc.channel, Math.floor(this._doc.synth.playhead));
					}
					event.preventDefault();
					break;
				case 189: // -
				case 173: // Firefox -
					this._transpose(false);
					event.preventDefault();
					break;
				case 187: // +
				case 61: // Firefox +
					this._transpose(true);
					event.preventDefault();
					break;
			}
		}
		
		private _whenPrevBarPressed = (): void => {
			this._doc.synth.prevBar();
		}
		
		private _whenNextBarPressed = (): void => {
			this._doc.synth.nextBar();
		}
		
		private _togglePlay = (): void => {
			if (this._doc.synth.playing) {
				this._pause();
			} else {
				this._play();
			}
		}
		
		private _play(): void {
			this._doc.synth.play();
			this.updatePlayButton();
		}
		
		private _pause(): void {
			this._doc.synth.pause();
			if (this._doc.autoFollow) {
				this._doc.synth.snapToBar(this._doc.bar);
			} else {
				this._doc.synth.snapToBar();
			}
			this.updatePlayButton();
		}
		
		private _setVolumeSlider = (): void => {
			this._doc.setVolume(Number(this._volumeSlider.value));
		}
		
		private _copy(): void {
			const pattern: Pattern | null = this._doc.getCurrentPattern();
			if (pattern == null) return;
			
			const patternCopy: PatternCopy = {
				notes: pattern.notes,
				beatsPerBar: this._doc.song.beatsPerBar,
				partsPerBeat: this._doc.song.partsPerBeat,
				drums: this._doc.song.getChannelIsDrum(this._doc.channel),
			};
			
			window.localStorage.setItem("patternCopy", JSON.stringify(patternCopy));
		}
		
		private _paste(): void {
			const pattern: Pattern | null = this._doc.getCurrentPattern();
			if (pattern == null) return;
			
			const patternCopy: PatternCopy | null = JSON.parse(String(window.localStorage.getItem("patternCopy")));
			
			if (patternCopy != null && patternCopy.drums == this._doc.song.getChannelIsDrum(this._doc.channel)) {
				this._doc.record(new ChangePaste(this._doc, pattern, patternCopy.notes, patternCopy.beatsPerBar, patternCopy.partsPerBeat));
			}
		}
		
		private _transpose(upward: boolean): void {
			const pattern: Pattern | null = this._doc.getCurrentPattern();
			if (pattern == null) return;
			
			const canReplaceLastChange: boolean = this._doc.lastChangeWas(this._changeTranspose);
			this._changeTranspose = new ChangeTranspose(this._doc, pattern, upward);
			this._doc.record(this._changeTranspose, canReplaceLastChange);
		}
		
		private _whenNewSongPressed = (): void => {
			this._doc.record(new ChangeSong(this._doc, ""));
			this._patternEditor.resetCopiedPins();
		}
		
		private _openExportPrompt = (): void => {
			this._openPrompt("export");
		}
		
		private _openInstrumentTypePrompt = (): void => {
			this._openPrompt("instrumentType");
		}
		
		private _openChorusPrompt = (): void => {
			this._openPrompt("chorus");
		}
		
		private _whenSetScale = (): void => {
			this._doc.record(new ChangeScale(this._doc, this._scaleSelect.selectedIndex));
		}
		
		private _whenSetKey = (): void => {
			this._doc.record(new ChangeKey(this._doc, this._keySelect.selectedIndex));
		}
		
		private _whenSetPartsPerBeat = (): void => {
			this._doc.record(new ChangePartsPerBeat(this._doc, Config.partCounts[this._partSelect.selectedIndex]));
		}
		
		private _whenSetInstrumentType = (): void => {
			const selectedIndex: number = this._instrumentTypeSelect.selectedIndex;
			const newType: InstrumentType = Config.pitchChannelTypeValues[Math.max(0, Math.min(Config.pitchChannelTypeValues.length - 1, selectedIndex))];
			this._doc.record(new ChangeInstrumentType(this._doc, newType));
		}
		
		private _whenSetFeedbackType = (): void => {
			this._doc.record(new ChangeFeedbackType(this._doc, this._feedbackTypeSelect.selectedIndex));
		}
		
		private _whenSetFeedbackEnvelope = (): void => {
			this._doc.record(new ChangeFeedbackEnvelope(this._doc, this._feedbackEnvelopeSelect.selectedIndex));
		}
		
		private _whenSetAlgorithm = (): void => {
			this._doc.record(new ChangeAlgorithm(this._doc, this._algorithmSelect.selectedIndex));
		}
		
		private _whenSetInstrument = (): void => {
			const pattern : Pattern | null = this._doc.getCurrentPattern();
			if (pattern == null) return;
			this._doc.record(new ChangePatternInstrument(this._doc, this._instrumentSelect.selectedIndex, pattern));
		}
		
		private _whenSetWave = (): void => {
			this._doc.record(new ChangeWave(this._doc, this._waveSelect.selectedIndex));
		}
		
		private _whenSetDrum = (): void => {
			this._doc.record(new ChangeWave(this._doc, this._drumSelect.selectedIndex));
		}
		
		private _whenSetFilter = (): void => {
			this._doc.record(new ChangeFilter(this._doc, this._filterSelect.selectedIndex));
		}
		
		private _whenSetTransition = (): void => {
			this._doc.record(new ChangeTransition(this._doc, this._transitionSelect.selectedIndex));
		}
		
		private _whenSetEffect = (): void => {
			this._doc.record(new ChangeEffect(this._doc, this._effectSelect.selectedIndex));
		}
		
		private _whenSetChorus = (): void => {
			this._doc.record(new ChangeChorus(this._doc, this._chorusSelect.selectedIndex));
		}

		private _whenSetPulseTransition = (): void => {
			this._doc.record(new ChangeTransition(this._doc, this._pulseTransitionSelect.selectedIndex));
		}

		private _whenSetPulseFilter = (): void => {
			this._doc.record(new ChangeFilter(this._doc, this._pulseFilterSelect.selectedIndex));
		}

		private _whenSetPulseChorus = (): void => {
			this._doc.record(new ChangeChorus(this._doc, this._pulseChorusSelect.selectedIndex));
		}

		private _whenSetPulseEffect = (): void => {
			this._doc.record(new ChangeEffect(this._doc, this._pulseEffectSelect.selectedIndex));
		}

		private _editMenuHandler = (event:Event): void => {
			switch (this._editMenu.value) {
				case "undo":
					this._doc.undo();
					break;
				case "redo":
					this._doc.redo();
					break;
				case "copy":
					this._copy();
					break;
				case "paste":
					this._paste();
					break;
				case "transposeUp":
					this._transpose(true);
					break;
				case "transposeDown":
					this._transpose(false);
					break;
				case "import":
					this._openPrompt("import");
					break;
				case "duration":
					this._openPrompt("duration");
					break;
			}
			this._editMenu.selectedIndex = 0;
		}
		
		private _optionsMenuHandler = (event:Event): void => {
			switch (this._optionsMenu.value) {
				case "autoPlay":
					this._doc.autoPlay = !this._doc.autoPlay;
					break;
				case "autoFollow":
					this._doc.autoFollow = !this._doc.autoFollow;
					break;
				case "showLetters":
					this._doc.showLetters = !this._doc.showLetters;
					break;
				case "showFifth":
					this._doc.showFifth = !this._doc.showFifth;
					break;
				case "showChannels":
					this._doc.showChannels = !this._doc.showChannels;
					break;
				case "showScrollBar":
					this._doc.showScrollBar = !this._doc.showScrollBar;
					break;
			}
			this._optionsMenu.selectedIndex = 0;
			this._doc.notifier.changed();
			this._doc.savePreferences();
		}
	}
	
	
	const doc: SongDocument = new SongDocument(location.hash);
	const editor: SongEditor = new SongEditor(doc);
	const beepboxEditorContainer: HTMLElement = document.getElementById("beepboxEditorContainer")!;
	beepboxEditorContainer.appendChild(editor.mainLayer);
	editor.whenUpdated();
	editor.mainLayer.focus();
	
	// don't autoplay on mobile devices, wait for input.
	if (!isMobile && doc.autoPlay) {
		function autoplay(): void {
			if (!document.hidden) {
				doc.synth.play();
				editor.updatePlayButton();
				window.removeEventListener("visibilitychange", autoplay);
			}
		}
		if (document.hidden) {
			// Wait until the tab is visible to autoplay:
			window.addEventListener("visibilitychange", autoplay);
		} else {
			autoplay();
		}
	}
	
	// BeepBox uses browser history state as its own undo history. Browsers typically
	// remember scroll position for each history state, but BeepBox users would prefer not 
	// auto scrolling when undoing. Sadly this tweak doesn't work on Edge or IE.
	if ("scrollRestoration" in history) history.scrollRestoration = "manual";
	
	editor.updatePlayButton();
}
