const config = {
	startScene: 'GAME',
	width: 380,
	height: 720,
	pixelPerfect: false, // display in the exact 380x720 resolution, whichever the window size and pixel density
	aboutUrl: "https://eliemichel.github.io/JeuDePresse/Eiffel/about",

	drawingWidth: 40,
	checkVictoryDelay: 500,

	initialBrushPosition: {
		x: 300,
		y: 230,
	},
	victory: false,

	// == DEBUG ==
	//drawingWidth: 90,
	//victory: true,
	// ==  ==
};

// Use this any time you set the size/position of a DOM element
config.domPixelMultiplier = config.pixelPerfect ? 1.0 / window.devicePixelRatio : 1.0;

const zip = (...rows) => [...rows[0]].map((_,c) => rows.map(row => row[c]));

function wait(ms) {
	return new Promise(resolve => { setTimeout(resolve, ms); });
}

function fetchImage(url) {
	return new Promise(resolve => {
		const img = new Image();
		img.addEventListener("load", e => resolve(img));
		img.src = url;
	});
}

function replaceColorByAlpha(image, color) {
	if (!color) return image;
	const tmpCanvas = document.createElement('canvas');
	tmpCanvas.width = image.width;
	tmpCanvas.height = image.height;
	const ctx = tmpCanvas.getContext("2d");
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(image, 0, 0);
	const imageData = ctx.getImageData(0, 0, image.width, image.height);
	for (let i = 0 ; i < imageData.data.length ; i += 4) {
		if (
			imageData.data[i + 0] == color[0] &&
			imageData.data[i + 1] == color[1] &&
			imageData.data[i + 2] == color[2]
		) {
			imageData.data[i + 3] = 0;
		}
	}
	ctx.putImageData(imageData, 0, 0);
	return tmpCanvas;
}

function setButtonImage(element, image) {
	element.src = image.toDataURL();
	element.style.width = `${image.width * config.domPixelMultiplier}em`;
	element.style.height = `${image.height * config.domPixelMultiplier}em`;	
}

function setupButton(args) {
	const {
		buttonElement,
		imageElement,
		images,
		placement
	} = args;

	setButtonImage(imageElement, images.default);
	imageElement.dataset.hover = false;
	imageElement.dataset.pressed = false;
	
	if (images.hover) {
		buttonElement.addEventListener("mouseenter", e => {
			setButtonImage(imageElement, images.hover);
			imageElement.dataset.hover = true;
		});
		buttonElement.addEventListener("mouseleave", e => {
			setButtonImage(imageElement, images.default);
			imageElement.dataset.hover = false;
		});
	}
	
	if (images.pressed) {
		buttonElement.addEventListener("mousedown", e => {
			setButtonImage(imageElement, images.pressed);
			imageElement.dataset.pressed = true;
		});
		buttonElement.addEventListener("mouseup", e => {
			setButtonImage(imageElement, images.default);
			imageElement.dataset.pressed = true;
		});
	}
	
	const style = buttonElement.style;
	style.display = 'none';
	style.position = 'absolute';
	for (const [key, value] of Object.entries(placement)) {
		style[key] = `${value * config.domPixelMultiplier}em`;
	}
}

class App {
	constructor() {
		this.state = {
			needRedraw: true,
			pendingVictoryCheck: null,
			victory: config.victory,
			scene: 'GAME', // of [ 'GAME', 'END' ]
			drag: {
				active: false,
				previousMouse: null,
			},
			drawingCanvas: null,
			drawing: null,
			brush: {
				x: config.initialBrushPosition.x,
				y: config.initialBrushPosition.y
			},
		};
		this.assets = {
			images: {},
			bboxes: {},
			drawings: {},
			sounds: {},
		};
		this.dom = {};
		this.audio = {
			context: null,
			mixers: {},
		};

		// Init drawing
		{
			const canvas = document.createElement("canvas");
			canvas.width = config.width;
			canvas.height = config.height;
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = "rgba(0,0,0,0.0)";
			ctx.fillRect(0, 0, config.width, config.height);
			ctx.strokeStyle = "rgba(255, 127, 39, 1.0)";
			ctx.lineWidth = config.drawingWidth;
			ctx.lineCap = 'round';
			this.state.drawingCanvas = canvas;
			this.state.drawing = ctx;
		}

		const $dom = new Promise(resolve => {
			document.addEventListener("DOMContentLoaded", resolve());
		}).then(this.onDomContentLoaded.bind(this));

		const $images = this.loadImages().then(() => {
			const { images, drawings } = this.assets;
			images.maskedTour = document.createElement("canvas");
			images.maskedTour.width = images.tour.width;
			images.maskedTour.height = images.tour.height;
			drawings.maskedTour = images.maskedTour.getContext("2d");

			this.createMessageImage();
		});
		//const $audio = this.loadAudio();

		Promise.all([
			$dom,
			$images,
			//$audio,
		]).then(() => {
			this.start();
		})
	}

	loadImages() {
		const { images, bboxes } = this.assets;

		// fill: [185, 122, 87] /* marron */
		// fill: [255, 127, 39] /* orange */
		// fill: [239, 228, 176] /* beige */
		// fill: [237, 28, 36] /* red */
		// fill: [112, 146, 190] /* blue grey */
		// fill: [34, 177, 76] /* dark green */
		// fill: [181, 230, 29] /* light green */
		// fill: [255, 174, 201] /* pink */
		// fill: [255, 201, 14] /* gold */

		const imageInfo = [
			{ name: "tour", background: [255, 255, 255], fill: [0, 0, 0] /* red */ },
			{ name: "tourFond", background: [255, 255, 255], fill: [181, 230, 29] /* light green */ },
			{ name: "projecteurs", background: [255, 255, 255], fill: [255, 201, 14] /* gold */ },
			{ name: "brosse", background: [255, 174, 201] },
			{ name: "victoire", background: [255, 174, 201] },
		]
		return Promise.all(
			imageInfo.map(async entry => {
				const image = await fetchImage(`images/${entry.name}.png`)
				images[entry.name] = replaceColorByAlpha(image, entry.background);
				if (entry.computeContentBBox) {
					bboxes[entry.name] = computeImageContentBBox(images[entry.name]); 
				}
				if (entry.fill) {
					const ctx = images[entry.name].getContext("2d");
					ctx.globalCompositeOperation = "source-in"
					ctx.fillStyle = `rgb(${entry.fill[0]},${entry.fill[1]},${entry.fill[2]})`; // beige
					ctx.fillRect(0, 0, images[entry.name].width, images[entry.name].height);
				}
			})
		);
	}

	createMessageImage() {
		const canvas = document.createElement("canvas");
		canvas.width = config.width;
		canvas.height = config.height / 2;
		const ctx = canvas.getContext("2d");

		ctx.fillStyle = "rgb(0,0,0)";
		ctx.textAlign = "center";
		ctx.font = "bold 20px monospace";
		ctx.fontVariantCaps = "small-caps";
		const message = [
			"Vous êtes endettés de 60M€",
			"de peinture, et la mairie",
			"ne vous remboursera pas !",
		];
		let y = 50;
		for (const line of message) {
			ctx.fillText(line, config.width / 2, y);
			y += 22;
		}

		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 0 ; i < imageData.data.length ; i += 4) {
			if (imageData.data[i + 3] < 64) {
				imageData.data[i + 0] = 0;
				imageData.data[i + 1] = 0;
				imageData.data[i + 2] = 0;
				imageData.data[i + 3] = 0;
			} else {
				imageData.data[i + 0] = 0;
				imageData.data[i + 1] = 0;
				imageData.data[i + 2] = 0;
				imageData.data[i + 3] = 255;
			}
		}
		ctx.putImageData(imageData, 0, 0);

		this.assets.images.message = canvas;
	}

	loadAudio() {
		const { assets } = this;
		const soundInfo = [
			//{ name: "guillotine03", type: "mp3" },
		]

		const audioCtx = new AudioContext();
		this.audio.context = audioCtx;

		return Promise.all(
			soundInfo.map(async entry => {
				const url = `sound/${entry.name}.${entry.type}`;
				const response = await fetch(url);
				const bytes = await response.arrayBuffer();
				assets.sounds[entry.name] = await audioCtx.decodeAudioData(bytes);
			})
		);
	}

	onDomContentLoaded() {
		const elementNames = [
			"main",
			"canvas",
			"play-btn",
			"play-btn-img",
			"back-btn",
			"back-btn-img",
			"E-btn",
			"E-btn-img",
			"fullscreen-btn",
			"fullscreen-btn-img",
			"about",
		];
		for (const name of elementNames) {
			this.dom[name] = document.getElementById(name);
		}
		this.dom.container = this.dom.main.parentElement;

		this.dom.canvas.width = config.width;
		this.dom.canvas.height = config.height;
		this.context2d = this.dom.canvas.getContext("2d");
		this.context2d.imageSmoothingEnabled = false;

		this.dom["play-btn"].addEventListener("click", e => {
			this.startTransitionToGame();
		});

		this.dom["back-btn"].addEventListener("click", e => {
			this.setScene('MENU');
		});

		this.dom["E-btn"].addEventListener("click", e => {
			window.open(config.aboutUrl, '_blank');
		});

		this.dom["fullscreen-btn"].addEventListener("click", e => {
			if (document.fullscreenElement) {
				screen.orientation.unlock();
				document.exitFullscreen();
			} else {
				this.dom.container.requestFullscreen();
				screen.orientation.lock('portrait').catch(err => console.log(`Could not lock portrait mode.`));
			}
		});

		document.addEventListener("keydown", this.onKeyDown.bind(this));
		document.addEventListener("keyup", this.onKeyUp.bind(this));
		document.addEventListener("touchstart", this.onTouchStart.bind(this));
		document.addEventListener("touchend", this.onTouchEnd.bind(this));
		document.addEventListener("touchmove", this.onTouchMove.bind(this));
		document.addEventListener("touchcancel", this.onTouchCancel.bind(this));
		document.addEventListener("mousedown", this.onMouseDown.bind(this));
		document.addEventListener("mouseup", this.onMouseUp.bind(this));
		document.addEventListener("mousemove", this.onMouseMove.bind(this));
		document.addEventListener("mouseenter", this.onMouseEnter.bind(this));
		new ResizeObserver(this.onResize.bind(this)).observe(this.dom.container);
		this.onResize();
	}

	onResize() {
		let width, height;
		if (config.pixelPerfect) {
			width = config.width * config.domPixelMultiplier;
			height = config.height * config.domPixelMultiplier;
		} else {
			const ratio = config.width / config.height;
			const heightFromWidth = window.innerWidth / ratio;
			const widthFromHeight = window.innerHeight * ratio;
			if (heightFromWidth > window.innerHeight) {
				height = window.innerHeight;
				width = widthFromHeight;
			} else {
				height = heightFromWidth;
				width = window.innerWidth;
			}
		}

		this.dom.canvas.style.width = `${width}px`;
		this.dom.canvas.style.height = `${height}px`;
		this.dom.main.style.width = `${width}px`;
		this.dom.main.style.height = `${height}px`;
		this.dom.main.style.top = `${(window.innerHeight - height) / 2}px`;
		this.dom.main.style['font-size'] = `${width / (config.width * config.domPixelMultiplier)}px`; // scale definition of '1em'

		const remainingWidth = window.innerWidth - width;
		this.dom.about.style.width = `${Math.min(remainingWidth / 2, config.width) - 20}px`;
		this.dom.about.style.display = remainingWidth > 400 && document.fullscreenElement == null ? 'block' : 'none';
	}

	onKeyDown(ev) {}

	onKeyUp(ev) {}

	onMouseDown(ev) {
		if (ev.button == 0 && this.state.scene == 'GAME') {
			this.startDragging({ x: ev.clientX, y: ev.clientY });
		}
	}

	onMouseMove(ev) {
		this.updateDragging({ x: ev.clientX, y: ev.clientY });
	}

	onMouseUp(ev) {
		if (ev.button == 0) {
			this.stopDragging();
		}
	}

	onMouseEnter(ev) {
		if (!ev.buttons.includes(0)) {
			this.stopDragging();
		}
	}

	onTouchStart(ev) {
		this.startDragging({ x: ev.touches[0].clientX, y: ev.touches[0].clientY });
	}

	onTouchEnd(ev) {
		this.stopDragging();
	}

	onTouchMove(ev) {
		this.updateDragging({ x: ev.touches[0].clientX, y: ev.touches[0].clientY });
	}

	onTouchCancel(ev) {
	}


	startDragging(position) {
		const { drag, character } = this.state;
		drag.active = true;
		drag.previousMouse = this.transformMouseToLocal(position);

		this.updateDragging(position);
	}

	updateDragging(position) {
		const { drag, drawing, drawingCanvas, brush } = this.state;
		if (!drag.active) return;

		const mouse = this.transformMouseToLocal(position);

		drawing.beginPath();
		drawing.moveTo(drag.previousMouse.x, drag.previousMouse.y);
		drawing.lineTo(mouse.x, mouse.y);
		drawing.stroke();

		const { maskedTour } = this.assets.drawings;
		maskedTour.save();
		maskedTour.drawImage(drawingCanvas, 0, 0);
		maskedTour.globalCompositeOperation = "source-in"
		maskedTour.drawImage(this.assets.images.tour, 0, 0);
		maskedTour.restore();

		brush.x = mouse.x;
		brush.y = mouse.y;

		this.triggerCheckVictory();

		drag.previousMouse = mouse;
	}

	stopDragging() {
		const { drag, character } = this.state;
		drag.active = false;
	}

	transformMouseToLocal(clientPosition) {
		const { x, y } = clientPosition;
		const rect = this.dom.canvas.getBoundingClientRect();
		return {
			x: (x - rect.x) * (config.width / rect.width),
			y: (y - rect.y) * (config.height / rect.height),
		};
	}

	triggerCheckVictory() {
		const { state } = this;
		if (state.pendingVictoryCheck) return;
		state.pendingVictoryCheck = wait(config.checkVictoryDelay).then(() => {
			this.checkVictory();
			state.pendingVictoryCheck = null;
		});
	}

	isVictory() {
		const { state, assets } = this;
		const { drawing } = state;
		const { images } = assets;
		const { width, height } = config;

		const tourData = images.tourFond.getContext("2d").getImageData(0, 0, width, height);
		const drawingData = drawing.getImageData(0, 0, width, height);
		for (let i = 0 ; i < tourData.data.length ; i += 4) {
			if (tourData.data[i + 3] != 0 && drawingData.data[i + 3] == 0) {
				console.log("i", i, i % width, Math.floor(i / width));
				return false;
			}
		}
		return true;
	}

	checkVictory() {
		if (this.isVictory()) {
			console.log('VICTORY');
			this.state.victory = true;
		}
	}

	start() {
		const { images, sounds } = this.assets;
		const autoSetupButton = (name, placement) => {
			setupButton({
				buttonElement: this.dom[`${name}-btn`],
				imageElement: this.dom[`${name}-btn-img`],
				images: {
					default: images[name],
					hover: images[`${name}Hover`],
					pressed: images[`${name}Pressed`],
				},
				placement
			});
		}

		/*
		autoSetupButton("play", {
			top: 240,
			right: 30
		});
		autoSetupButton("back", {
			top: 0,
			left: 0
		});
		autoSetupButton("E", {
			bottom: 0,
			left: 0
		});
		autoSetupButton("fullscreen", {
			top: 0,
			left: 0
		});
		*/

		this.setScene(config.startScene);
		requestAnimationFrame(this.onFrame.bind(this));
	}

	startGame() {
		const { state } = this;
		this.dom["fullscreen-btn"].style.display = 'block';
	}

	stopGame() {
		this.dom["fullscreen-btn"].style.display = 'none';
	}

	startEnd() {
		this.dom["back-btn"].style.display = 'block';
	}

	stopEnd() {
		this.dom["back-btn"].style.display = 'none';
	}

	startGameOver() {

		this.setScene('END');
	}

	setScene(newScene) {
		const { state } = this;
		switch (state.scene) {
		case 'GAME':
			this.stopGame();
			break;
		case 'END':
			this.stopEnd();
			break;
		default:
			console.error(`Invalid scene ID: '${state.scene}'`);
			return;
		}
		state.scene = newScene;
		switch (state.scene) {
		case 'GAME':
			this.startGame();
			break;
		case 'END':
			this.startEnd();
			break;
		default:
			console.error(`Invalid scene ID: '${state.scene}'`);
			return;
		}
		state.needRedraw = true;
	}

	onFrame() {
		const { state } = this;
		const frameTime = performance.now();
		const deltaTime = frameTime - state.previousFrameTime;

		switch (state.scene) {
		case 'GAME':
			this.updateGame(deltaTime);
			break;
		case 'END':
			break;
		}

		if (state.needRedraw) {
			this.draw();
		}
		state.needRedraw = false;
		state.previousFrameTime = frameTime;
		requestAnimationFrame(this.onFrame.bind(this));
	}

	updateGame(dt) {
		const { state } = this;
		state.needRedraw = true;
	}

	playSound(soundName, loop) {
		const audioCtx = this.audio.context;
		const source = audioCtx.createBufferSource();
		source.buffer = this.assets.sounds[soundName];
		source.connect(audioCtx.destination);
		source.loop = !!loop;
		source.start();
	}

	draw() {
		const { state } = this;
		const { brush, scene, victory } = state;
		const { images } = this.assets;
		const ctx = this.context2d;

		ctx.fillStyle = "rgb(239, 228, 176)"; // beige
		ctx.fillStyle = "rgb(255, 127, 39)"; // orange
		ctx.fillStyle = "rgb(181, 230, 29)"; // light green
		ctx.fillStyle = "rgb(34, 177, 76)"; // dark green
		ctx.fillRect(0, 0, config.width, config.height);

		switch (scene) {
		case 'GAME':
			if (victory) {
				ctx.drawImage(images.projecteurs, 0, 0);
			}

			ctx.drawImage(images.tourFond, 0, 0);

			ctx.drawImage(images.maskedTour, 0, 0);

			ctx.save();
			ctx.globalAlpha = 0.2;
			ctx.drawImage(state.drawingCanvas, 0, 0);
			ctx.restore();

			ctx.drawImage(images.brosse, brush.x - images.brosse.width / 2, brush.y - images.brosse.height / 2);

			if (victory) {
				ctx.drawImage(images.victoire, 0, 0);
				ctx.drawImage(images.message, -5, 510);
			}

			break;
		}
	}
}

app = new App();
