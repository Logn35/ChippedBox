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

namespace beepbox {
	export class Piano {
		private readonly _pianoContainer: HTMLDivElement = html.div({style: "width: 100%; height: 100%; display: flex; flex-direction: column-reverse; align-items: stretch;"});
		private readonly _drumContainer: HTMLDivElement = html.div({style: "width: 100%; height: 100%; display: none; flex-direction: column-reverse; align-items: stretch;"});
		private readonly _preview: HTMLDivElement = html.div({style: "display: none; width: 100%; border: 2px solid #ffffff; position: absolute; box-sizing: border-box; pointer-events: none;"});
		public readonly container: HTMLDivElement = html.div({style: "width: 32px; height: 100%; overflow: hidden; position: relative; flex-shrink: 0; touch-action: none;"}, [
			this._pianoContainer,
			this._drumContainer,
			this._preview,
		]);
		
		private readonly _editorHeight: number = 481;
		private readonly _pianoKeys: HTMLDivElement[] = [];
		private readonly _pianoLabels: HTMLDivElement[] = [];
		private readonly _drumKeys: HTMLDivElement[] = [];
		
		private _pitchHeight: number = 0;
		private _pitchCount: number = 0;
		private _mouseY: number = 0;
		private _mouseDown: boolean = false;
		private _mouseOver: boolean = false;
		private _cursorPitch: number = 0;
		private _renderedScale: number = -1;
		private _renderedDrums: boolean = false;
		private _renderedKey: number = -1;
		private _renderedPitchCount: number = -1;
		private _renderedPressed: boolean = false;
		private _renderedPressedPitch: number = -1;
		
		constructor(private _doc: SongDocument) {
			this.container.addEventListener("mousedown", this._whenMousePressed);
			document.addEventListener("mousemove", this._whenMouseMoved);
			document.addEventListener("mouseup", this._whenMouseReleased);
			this.container.addEventListener("mouseover", this._whenMouseOver);
			this.container.addEventListener("mouseout", this._whenMouseOut);
			
			this.container.addEventListener("touchstart", this._whenTouchPressed);
			this.container.addEventListener("touchmove", this._whenTouchMoved);
			this.container.addEventListener("touchend", this._whenTouchReleased);
			this.container.addEventListener("touchcancel", this._whenTouchReleased);
			
			this._doc.notifier.watch(this._documentChanged);
			this._documentChanged();
			window.requestAnimationFrame(this._onAnimationFrame);
		}
		
		private _updateCursorPitch(): void {
			const scale: ReadonlyArray<boolean> = Config.scaleFlags[this._doc.song.scale];
			const containerHeight: number = Math.max(1, this.container.clientHeight);
			const normalizedY: number = Math.max(0, Math.min(1, this._mouseY / containerHeight));
			const mousePitch: number = Math.max(0, Math.min(this._pitchCount - 1, (1 - normalizedY) * this._pitchCount));
			
			if (scale[Math.floor(mousePitch) % 12] || this._doc.song.getChannelIsDrum(this._doc.channel)) {
				this._cursorPitch = Math.floor(mousePitch);
			} else {
				let topPitch: number = Math.floor(mousePitch) + 1;
				let bottomPitch: number = Math.floor(mousePitch) - 1;
				while (!scale[topPitch % 12]) topPitch++;
				while (!scale[(bottomPitch) % 12]) bottomPitch--;
				
				let topRange: number = topPitch;
				let bottomRange: number = bottomPitch + 1;
				if (topPitch % 12 == 0 || topPitch % 12 == 7) topRange -= 0.5;
				if (bottomPitch % 12 == 0 || bottomPitch % 12 == 7) bottomRange += 0.5;
				this._cursorPitch = mousePitch - bottomRange > topRange - mousePitch ? topPitch : bottomPitch;
			}
		}
		
		private _setSynthPitch(): void {
			this._doc.synth.pianoPitch[0] = this._cursorPitch + this._doc.getBaseVisibleOctave(this._doc.channel) * 12;
			this._doc.synth.pianoChannel = this._doc.channel;
		}
		
		private _whenMouseOver = (event: MouseEvent): void => {
			if (this._mouseOver) return;
			this._mouseOver = true;
			this._updatePreview();
		}
		
		private _whenMouseOut = (event: MouseEvent): void => {
			if (!this._mouseOver) return;
			this._mouseOver = false;
			this._updatePreview();
		}
		
		private _whenMousePressed = (event: MouseEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			const boundingRect: ClientRect = this.container.getBoundingClientRect();
			this._mouseY = (event.clientY || event.pageY) - boundingRect.top;
			if (isNaN(this._mouseY)) this._mouseY = 0;
			this._updateCursorPitch();
			this._setSynthPitch();
			this._doc.synth.pianoPressed = true;
			this._updatePreview();
			this._updatePressedKeys();
		}
		
		private _whenMouseMoved = (event: MouseEvent): void => {
			const boundingRect: ClientRect = this.container.getBoundingClientRect();
			this._mouseY = (event.clientY || event.pageY) - boundingRect.top;
			if (isNaN(this._mouseY)) this._mouseY = 0;
			this._updateCursorPitch();
			if (this._mouseDown) this._setSynthPitch();
			this._updatePreview();
			this._updatePressedKeys();
		}
		
		private _whenMouseReleased = (event: MouseEvent): void => {
			this._mouseDown = false;
			this._doc.synth.pianoPressed = false;
			this._updatePreview();
			this._updatePressedKeys();
		}
		
		private _whenTouchPressed = (event: TouchEvent): void => {
			event.preventDefault();
			this._mouseDown = true;
			const boundingRect: ClientRect = this.container.getBoundingClientRect();
			this._mouseY = event.touches[0].clientY - boundingRect.top;
			if (isNaN(this._mouseY)) this._mouseY = 0;
			this._updateCursorPitch();
			this._setSynthPitch();
			this._doc.synth.pianoPressed = true;
			this._updatePreview();
			this._updatePressedKeys();
		}
		
		private _whenTouchMoved = (event: TouchEvent): void => {
			event.preventDefault();
			const boundingRect: ClientRect = this.container.getBoundingClientRect();
			this._mouseY = event.touches[0].clientY - boundingRect.top;
			if (isNaN(this._mouseY)) this._mouseY = 0;
			this._updateCursorPitch();
			this._setSynthPitch();
			this._updatePreview();
			this._updatePressedKeys();
		}
		
		private _whenTouchReleased = (event: TouchEvent): void => {
			event.preventDefault();
			this._mouseDown = false;
			this._doc.synth.pianoPressed = false;
			this._updatePreview();
			this._updatePressedKeys();
		}
		
		private _onAnimationFrame = (): void => {
			window.requestAnimationFrame(this._onAnimationFrame);
			this._updatePressedKeys();
		}
		
		private _updatePreview(): void {
			const previewIsVisible: boolean = this._mouseOver && !this._mouseDown;
			this._preview.style.display = previewIsVisible ? "" : "none";
			if (!previewIsVisible) return;
			
			const pitchHeight: number = this._pitchHeight / (this._editorHeight / Math.max(1, this.container.clientHeight));
			this._preview.style.left = "0px";
			this._preview.style.top = pitchHeight * (this._pitchCount - this._cursorPitch - 1) + "px";
			this._preview.style.height = pitchHeight + "px";
		}
		
		private _updatePressedKeys(): void {
			const pressed: boolean = this._doc.synth.pianoPressed && this._doc.synth.pianoChannel == this._doc.channel;
			const octaveOffset: number = this._doc.getBaseVisibleOctave(this._doc.channel) * 12;
			const pressedPitch: number = pressed ? this._doc.synth.pianoPitch[0] - octaveOffset : -1;
			if (this._renderedPressed == pressed && this._renderedPressedPitch == pressedPitch) return;
			this._renderedPressed = pressed;
			this._renderedPressedPitch = pressedPitch;
			
			const keys: HTMLDivElement[] = this._doc.song.getChannelIsDrum(this._doc.channel) ? this._drumKeys : this._pianoKeys;
			for (let i: number = 0; i < keys.length; i++) {
				const key: HTMLDivElement = keys[i];
				if (i == pressedPitch) {
					key.classList.add("pressed");
				} else {
					key.classList.remove("pressed");
				}
			}
		}
		
		private _documentChanged = (): void => {
			const isDrum: boolean = this._doc.song.getChannelIsDrum(this._doc.channel);
			this._pitchCount = isDrum ? Config.drumCount : this._doc.getVisiblePitchCount();
			this._pitchHeight = this._editorHeight / this._pitchCount;
			this._updateCursorPitch();
			this._setSynthPitch();
			this._render();
			this._updatePreview();
			this._updatePressedKeys();
		}
		
		private _render(): void {
			if (!this._doc.showLetters) return;
			
			const isDrum: boolean = this._doc.song.getChannelIsDrum(this._doc.channel);
			if (this._renderedScale == this._doc.song.scale && this._renderedKey == this._doc.song.key && this._renderedDrums == isDrum && this._renderedPitchCount == this._pitchCount) return;
			this._renderedScale = this._doc.song.scale;
			this._renderedKey = this._doc.song.key;
			this._renderedDrums = isDrum;
			
			this._pianoContainer.style.display = isDrum ? "none" : "flex";
			this._drumContainer.style.display = isDrum ? "flex" : "none";
			
			if (this._renderedPitchCount != this._pitchCount) {
				this._renderedPitchCount = this._pitchCount;
				this._pianoContainer.innerHTML = "";
				this._drumContainer.innerHTML = "";
				this._pianoKeys.length = 0;
				this._pianoLabels.length = 0;
				this._drumKeys.length = 0;
				
				for (let i: number = 0; i < this._pitchCount; i++) {
					if (!isDrum) {
						const pianoLabel: HTMLDivElement = html.div({className: "piano-label", style: "font-weight: bold; -webkit-text-stroke-width: 0; font-size: 11px; font-family: sans-serif; position: absolute; padding-left: 15px; left: 0; right: 0; top: 50%; transform: translateY(-50%); white-space: nowrap;"});
						const pianoKey: HTMLDivElement = html.div({className: "piano-button", style: "position: relative; flex: 1 1 0; min-height: 0;"}, [pianoLabel]);
						this._pianoContainer.appendChild(pianoKey);
						this._pianoLabels[i] = pianoLabel;
						this._pianoKeys[i] = pianoKey;
					} else {
						const scale: number = (1.0 - (i / this._pitchCount) * 0.35) * 100;
						const drumKey: HTMLDivElement = html.div({className: "drum-button", style: `position: relative; flex: 1 1 0; min-height: 0; background-size: ${scale}% ${scale}%;`});
						this._drumContainer.appendChild(drumKey);
						this._drumKeys[i] = drumKey;
					}
				}
			}
			
			if (!isDrum) {
				for (let j: number = 0; j < this._pitchCount; j++) {
					const pitchNameIndex: number = (j + Config.keyTransposes[this._doc.song.key]) % 12;
					const isWhiteKey: boolean = Config.pianoScaleFlags[pitchNameIndex];
					const enabled: boolean = Config.scaleFlags[this._doc.song.scale][j % 12];
					const key: HTMLDivElement = this._pianoKeys[j];
					const label: HTMLDivElement = this._pianoLabels[j];
					key.style.background = isWhiteKey ? (enabled ? "#ffffff" : "#c8c8c8") : (enabled ? "#444444" : "#2c2c2c");
					key.style.opacity = enabled ? "1" : "0.65";
					if (enabled) {
						key.classList.remove("disabled");
					} else {
						key.classList.add("disabled");
					}
					if (!enabled) {
						label.style.display = "none";
					} else {
						label.style.display = "";
						label.style.color = isWhiteKey ? "#000000" : "#ffffff";
						label.textContent = Piano.getPitchName(pitchNameIndex, j);
					}
				}
			}
		}
		
		public static getPitchName(pitchNameIndex: number, scaleIndex: number): string {
			let text: string | null = Config.pitchNames[pitchNameIndex];
			if (text != null) return text;
			
			const shiftDir: number = Config.blackKeyNameParents[scaleIndex % 12];
			text = Config.pitchNames[(pitchNameIndex + 12 + shiftDir) % 12]!;
			if (shiftDir == 1) {
				text += "♭";
			} else if (shiftDir == -1) {
				text += "♯";
			}
			return text;
		}
	}
}
