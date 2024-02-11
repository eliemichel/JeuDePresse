const config = {
	startScene: 'MENU',
	characterSpeed: 0.75,
	fallSpeed: 0.2,
	width: 380,
	height: 720,
	ennemySpawn: {
		distance: 120,
	},
	countDownDelay: 1000, // ms between each number
	pixelPerfect: false, // display in the exact 380x720 resolution, whichever the window size and pixel density
	anim: {
		death: {
			initialVelocity: {
				x: 0.25,
				y: -0.5,
			},
			rotationVelocity: 2,
			duration: 1000,
		},
		robert: {
			start: 2000,
			wait: {
				min: 3000,
				max: 8000,
			},
		},
		guillotine: {
			start: 3000,
			wait: {
				min: 3000,
				max: 8000,
			},
		},
		transitionToGame: {
			duration: 900,
			speed: 400,
		},
		invicible: {
			iterations: 5,
			period: 500,
		},
	},
	gravity: 0.0025,
	aboutUrl: "https://eliemichel.github.io/JeuDePresse/Robert/about",
	defaultLives: 3,
	hud: {
		livesMargin: 5,
	},

	// == DEBUG ==
	//countDownDelay: 100,
	//startScene: 'GAME',
	//defaultLives: 2,
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

function bboxOffset(bbox, x, y) {
	return {
		minx: bbox.minx + x,
		miny: bbox.miny + y,
		maxx: bbox.maxx + x,
		maxy: bbox.maxy + y,
	};
}

function bboxFromImage(img, x, y) {
	return {
		minx: x,
		miny: y,
		maxx: x + img.width,
		maxy: y + img.height,
	};
}

function bboxIntersection(a, b) {
	return {
		minx: Math.max(a.minx, b.minx),
		maxx: Math.min(a.maxx, b.maxx),
		miny: Math.max(a.miny, b.miny),
		maxy: Math.min(a.maxy, b.maxy),
	}
}

// BBox of the non-transparent content of the image
function computeImageContentBBox(canvas) {
	const bbox = {
		minx: 0,
		miny: 0,
		maxx: -1,
		maxy: -1,
	};
	const ctx = canvas.getContext("2d");
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	for (let i = 0 ; i < imageData.data.length ; i += 4) {
		if (imageData.data[i + 3] > 0) {
			const x = (i / 4) % canvas.width;
			const y = Math.floor((i / 4) / canvas.width);
			if (bbox.maxx == -1) {
				bbox.minx = x;
				bbox.miny = y;
				bbox.maxx = x + 1;
				bbox.maxy = y + 1;
			} else {
				bbox.minx = Math.min(x, bbox.minx);
				bbox.miny = Math.min(y, bbox.miny);
				bbox.maxx = Math.max(x + 1, bbox.maxx);
				bbox.maxy = Math.max(y + 1, bbox.maxy);
			}
		}
	}

	return bbox;
}

function isOpaqueAt(canvas, position) {
	const { x, y } = position;
	if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false;
	return canvas.getContext("2d").getImageData(x, y, 1, 1).data[3] > 0
}

function bboxIsEmpty(bbox) {
	return (
		(bbox.maxx - bbox.minx) <= 0.0 ||
		(bbox.maxy - bbox.miny) <= 0.0
	);
}

function bboxStroke(ctx, bbox) {
	ctx.strokeRect(
		bbox.minx + 0.5,
		bbox.miny + 0.5,
		bbox.maxx - bbox.minx,
		bbox.maxy - bbox.miny,
	);
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
			scene: 'MENU', // of [ 'MENU', 'GAME', 'END' ]
			ennemies: [
				// { x, y }
			],
			character: {
				position: { x: config.width / 2, y: 600 },
				velocity: { x: 0, y: 0 },
				rotation: 0,
				movingRight: false,
				movingLeft: false,
				skin: "character",
			},
			countDown: 0,
			idDead: false,
			isInvicible: false,
			lives: config.defaultLives,
			drag: {
				active: false,
				startCharacterPosition: { x: 0 },
				startPosition: { x: 0 },
			},
			robertFrame: 0,
			guillotineFrame: 0,
			lastLifeSkin: "heart",
			transitionToGameStartTime: null,
			previousFrameTime: performance.now(),
		};
		this.assets = {
			images: {},
			bboxes: {},
			sounds: {},
		};
		this.dom = {};
		this.audio = { context: null };

		const $dom = new Promise(resolve => {
			document.addEventListener("DOMContentLoaded", resolve());
		}).then(this.onDomContentLoaded.bind(this));

		const $images = this.loadImages();
		const $audio = this.loadAudio();

		Promise.all([
			$dom,
			$images,
			$audio,
		]).then(() => {
			this.start();
		})
	}

	loadImages() {
		const imageInfo = [
			{ name: "background", background: null },
			{ name: "play", background: [255, 174, 201] },
			{ name: "playHover", background: [255, 174, 201] },
			{ name: "playPressed", background: [255, 174, 201] },
			{ name: "playHighlight", background: [255, 174, 201] },
			{ name: "back", background: [255, 174, 201] },
			{ name: "backHover", background: [255, 174, 201] },
			{ name: "backPressed", background: [255, 174, 201] },
			{ name: "E", background: [255, 174, 201] },
			{ name: "EHover", background: [255, 174, 201] },
			{ name: "EPressed", background: [255, 174, 201] },
			{ name: "guillotine", background: [255, 174, 201], computeContentBBox: true },
			{ name: "guillotineLarge01", background: [255, 174, 201] },
			{ name: "guillotineLarge02", background: [255, 174, 201] },
			{ name: "guillotineLarge03", background: [255, 174, 201] },
			{ name: "guillotineLarge04", background: [255, 174, 201] },
			{ name: "character", background: [255, 174, 201] },
			{ name: "characterHighlight", background: [255, 174, 201] },
			{ name: "robert01", background: [255, 174, 201] },
			{ name: "robert02", background: [255, 174, 201] },
			{ name: "robert03", background: [255, 174, 201] },
			{ name: "menuTitle", background: [255, 174, 201] },
			{ name: "1", background: [255, 174, 201] },
			{ name: "2", background: [255, 174, 201] },
			{ name: "3", background: [255, 174, 201] },
			{ name: "gameover", background: [255, 174, 201] },
			{ name: "fullscreen", background: [255, 174, 201] },
			{ name: "fullscreenHover", background: [255, 174, 201] },
			{ name: "heart", background: [255, 174, 201] },
			{ name: "heartBroken01", background: [255, 174, 201] },
			{ name: "heartBroken02", background: [255, 174, 201] },
			{ name: "heartBroken03", background: [255, 174, 201] },
		]
		return Promise.all(
			imageInfo.map(entry => fetchImage(`images/${entry.name}.png`))
		).then(loadedImages => {
			const { images, bboxes } = this.assets;
			for (const [image, entry] of zip(loadedImages, imageInfo)) {
				images[entry.name] = replaceColorByAlpha(image, entry.background);
				if (entry.computeContentBBox) {
					bboxes[entry.name] = computeImageContentBBox(images[entry.name]); 
				}
			}
		});
	}

	loadAudio() {
		const { assets } = this;
		const soundInfo = [
			{ name: "guillotine01", type: "mp3" },
			{ name: "guillotine02", type: "mp3" },
			{ name: "guillotine03", type: "mp3" },
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
				document.exitFullscreen();
			} else {
				this.dom.container.requestFullscreen();
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
		this.dom.about.style.display = remainingWidth > 400 ? 'block' : 'none';
	}

	onKeyDown(ev) {
		const { character } = this.state;
		if (ev.key == 'ArrowRight') {
			character.movingRight = true;
		}
		if (ev.key == 'ArrowLeft') {
			character.movingLeft = true;
		}
	}

	onKeyUp(ev) {
		const { character } = this.state;
		if (ev.key == 'ArrowRight') {
			character.movingRight = false;
		}
		if (ev.key == 'ArrowLeft') {
			character.movingLeft = false;
		}
	}

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
		this.cancelDragging({ x: ev.touches[0].clientX, y: ev.touches[0].clientY });
	}


	startDragging(position) {
		const { drag, character } = this.state;
		drag.active = true;
		drag.startCharacterPosition.x = character.position.x;
		drag.startPosition.x = position.x;
	}

	updateDragging(position) {
		const { drag, character } = this.state;
		if (!drag.active) return;
		const deltaX = position.x - drag.startPosition.x;
		character.position.x = drag.startCharacterPosition.x + deltaX;
		character.position.x = Math.min(Math.max(0, character.position.x), config.width);
	}

	stopDragging() {
		const { drag, character } = this.state;
		drag.active = false;
	}

	cancelDragging() {
		const { drag, character } = this.state;
		drag.active = false;
		character.position.x = drag.startCharacterPosition.x;
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
		this.dom[`fullscreen-btn-img`].style.opacity = this.dom.canvas.requestFullscreen ? 0.5 : 0.0;

		// Robert animation
		const robertAnimation = () => {
			wait(0.0)
			.then(() => {
				this.state.robertFrame = 2;
				this.state.needRedraw = true;
				return wait(50);
			})
			.then(() => {
				this.state.robertFrame = 1;
				this.state.needRedraw = true;
				return wait(100);
			})
			.then(() => {
				this.state.robertFrame = 0;
				this.state.needRedraw = true;
				const { min, max } = config.anim.robert.wait;
				return wait(min + Math.random() * (max - min));
			})
			.then(robertAnimation);
		}
		wait(config.anim.robert.start).then(robertAnimation);

		// Guillotine animation
		const guillotineAnimation = () => {
			wait(0.0)
			.then(() => {
				this.state.guillotineFrame = 1;
				this.state.needRedraw = true;
				return wait(50);
			})
			.then(() => {
				if (this.state.scene == 'MENU') {
					const soundIndex = Math.floor(Math.random() * 3);
					this.playSound(`guillotine0${soundIndex+1}`);
				}
				return wait(50);
			})
			.then(() => {
				this.state.guillotineFrame = 2;
				this.state.needRedraw = true;
				return wait(50);
			})
			.then(() => {
				this.state.guillotineFrame = 3;
				this.state.needRedraw = true;
				return wait(1000);
			})
			.then(() => {
				this.state.guillotineFrame = 0;
				this.state.needRedraw = true;
				const { min, max } = config.anim.guillotine.wait;
				return wait(min + Math.random() * (max - min));
			})
			.then(guillotineAnimation);
		}
		wait(config.anim.guillotine.start).then(guillotineAnimation);

		// Play button animation
		const playButtonAnimation = async () => {
			const element = this.dom["play-btn-img"];
			if (element.dataset.hover != "true" && element.dataset.pressed != "true") {
				setButtonImage(element, this.assets.images.playHighlight);
			}
			await wait(500);
			if (element.dataset.hover != "true" && element.dataset.pressed != "true") {
				setButtonImage(element, this.assets.images.play);
			}
			await wait(500);
			playButtonAnimation();
		}
		playButtonAnimation();

		this.setScene(config.startScene);
		requestAnimationFrame(this.onFrame.bind(this));
	}

	startMenu() {
		this.state.transitionToGameStartTime = null;
		this.dom["play-btn"].style.display = 'block';
		this.dom["E-btn"].style.display = 'block';
		this.dom["fullscreen-btn"].style.display = 'block';
	}

	stopMenu() {
		this.dom["play-btn"].style.display = 'none';
		this.dom["E-btn"].style.display = 'none';
		this.dom["fullscreen-btn"].style.display = 'none';
	}

	startTransitionToGame() {
		this.dom["play-btn"].style.display = 'none';
		this.state.transitionToGameStartTime = performance.now();
		wait(config.anim.transitionToGame.duration)
		.then(() => {
			this.setScene('GAME');
		})
	}

	startGame() {
		const { state } = this;
		state.ennemies = [];
		state.lives = config.defaultLives;
		this.restartGameAfterHit();
		this.startCountDown();
	}

	restartGameAfterHit() {
		const { state } = this;
		state.isDead = false;
		state.character.position = { x: config.width / 2, y: 600 };
		state.character.rotation = 0;
	}

	stopGame() {

	}

	startEnd() {
		this.dom["back-btn"].style.display = 'block';
	}

	stopEnd() {
		this.dom["back-btn"].style.display = 'none';
	}

	startCountDown() {
		const { state } = this;
		state.countDown = 3;
		state.needRedraw = true;

		wait(config.countDownDelay)
		.then(() => {
			state.countDown = 2;
			state.needRedraw = true;
			return wait(config.countDownDelay);
		})
		.then(() => {
			state.countDown = 1;
			state.needRedraw = true;
			return wait(config.countDownDelay);
		})
		.then(() => {
			state.countDown = 0;
			state.needRedraw = true;
		});
	}

	onCharacterHit() {
		Promise.all([
			this.playHeartBreakAnimation(),
			this.playCharacterDepthAnimation(),
		]).then(() => {
			if (this.state.lives <= 0) {
				this.startGameOver();
			} else {
				this.restartGameAfterHit();
				return this.playCharacterInvicible();
			}
		})
	}

	async playHeartBreakAnimation() {
		const { state } = this;

		state.lastLifeSkin = "heartBroken01";
		await wait(50);
		state.lastLifeSkin = "heartBroken02";
		await wait(50);
		state.lastLifeSkin = "heartBroken03";
		await wait(50);

		state.lastLifeSkin = "heart";
		state.lives -= 1;
	}

	async playCharacterDepthAnimation() {
		const { state } = this;
		const { character } = state;
		state.isDead = true;
		character.velocity = {
			x: (character.movingRight ? 1 : character.movingLeft ? -1 : 0) * config.anim.death.initialVelocity.x,
			y: config.anim.death.initialVelocity.y,
		}
		const soundIndex = Math.floor(Math.random() * 3);
		this.playSound(`guillotine0${soundIndex+1}`);
		await wait(config.anim.death.duration);
	}

	async playCharacterInvicible() {
		const { state } = this;
		const { character } = state;
		state.isInvicible = true;
		for (let i = 0 ; i < config.anim.invicible.iterations ; ++i) {
			character.skin = "characterHighlight";
			await wait(config.anim.invicible.period / 2);
			character.skin = "character";
			await wait(config.anim.invicible.period / 2);
		}
		state.isInvicible = false;
	}

	startGameOver() {

		this.setScene('END');
	}

	setScene(newScene) {
		const { state } = this;
		switch (state.scene) {
		case 'MENU':
			this.stopMenu();
			break;
		case 'GAME':
			this.stopGame();
			break;
		case 'END':
			this.stopEnd();
			break;
		default:
			console.error(`Invalid scene ID: '${newScene}'`);
			return;
		}
		switch (newScene) {
		case 'MENU':
			this.startMenu();
			break;
		case 'GAME':
			this.startGame();
			break;
		case 'END':
			this.startEnd();
			break;
		default:
			console.error(`Invalid scene ID: '${newScene}'`);
			return;
		}
		state.scene = newScene;
		state.needRedraw = true;
	}

	onFrame() {
		const { state } = this;
		const frameTime = performance.now();
		const deltaTime = frameTime - state.previousFrameTime;

		switch (state.scene) {
		case 'MENU':
			this.updateMenu(deltaTime);
			break;
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

	updateMenu() {
		if (this.state.transitionToGameStartTime != null) {
			this.state.needRedraw = true;
		}
	}

	updateGame(dt) {
		const { state } = this;
		const { images, bboxes } = this.assets;
		const { ennemies, character } = state;

		// Ennemy update
		if (state.countDown == 0) {
			for (const en of ennemies) {
				en.y += config.fallSpeed * dt;
			}
			if (ennemies.length == 0 || ennemies.at(-1).y > config.ennemySpawn.distance) {
				const img = images.guillotine;
				const x = Math.floor(Math.random() * (config.width - img.width));
				const y = -img.height;
				ennemies.push({ x, y });
			}
			state.ennemies = state.ennemies.filter(en => en.y < config.height);
		}

		// Character update
		if (state.isDead) {
			character.position.x += character.velocity.x * dt;
			character.position.y += character.velocity.y * dt;
			character.velocity.y += config.gravity * dt;
			character.rotation += config.anim.death.rotationVelocity;
		} else {
			if (character.movingRight) {
				character.position.x += config.characterSpeed * dt;
			}
			if (character.movingLeft) {
				character.position.x -= config.characterSpeed * dt;
			}
			character.position.x = Math.min(Math.max(0, character.position.x), config.width);
		}

		// Collision detection
		if (!state.isDead && !state.isInvicible) {
			for (const en of ennemies) {
				if (!bboxIsEmpty(bboxIntersection(
					bboxOffset(bboxes.guillotine, en.x, en.y),
					bboxFromImage(images.character, character.position.x - images.character.width / 2, character.position.y)
				))) {
					const x = character.position.x - images.character.width / 2;
					const y = character.position.y;
					const lowerLeft = {
						x: en.x + bboxes.guillotine.minx - x,
						y: en.y + bboxes.guillotine.maxy - y,
					};
					const lowerMiddle = {
						x: en.x + (bboxes.guillotine.minx + bboxes.guillotine.maxx) / 2 - x,
						y: en.y + bboxes.guillotine.maxy - y,
					};
					const lowerRight = {
						x: en.x + bboxes.guillotine.maxx - x,
						y: en.y + bboxes.guillotine.maxy - y,
					};
					const upperMiddle = {
						x: en.x + (bboxes.guillotine.minx + bboxes.guillotine.maxx) / 2 - x,
						y: en.y + bboxes.guillotine.miny - y,
					};
					const lowerLeftHit = isOpaqueAt(images.character, lowerLeft);
					const lowerMiddleHit = isOpaqueAt(images.character, lowerMiddle);
					const lowerRightHit = isOpaqueAt(images.character, lowerRight);
					const upperRightHit = isOpaqueAt(images.character, upperMiddle);
					if (lowerLeftHit || lowerMiddleHit || lowerRightHit || upperRightHit) {
						this.onCharacterHit();
					}
				}
			}
		}

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
		const { scene, ennemies, character, countDown } = state;
		const { images, bboxes } = this.assets;
		const ctx = this.context2d;

		ctx.drawImage(images.background, 0, 0);

		switch (scene) {
		case 'MENU':
			const positions ={
				robert: 0,
				guillotine: 0,
				menu: -90,
			};
			if (this.state.transitionToGameStartTime != null) {
				const time = (performance.now() - this.state.transitionToGameStartTime) / 1000.0;
				const speed = config.anim.transitionToGame.speed;
				positions.robert = time * speed;
				positions.guillotine = -time * speed;
				positions.menu = -90-time * speed + speed * 0.5 * Math.sin(Math.PI * Math.exp(-time));
			}
			ctx.drawImage(images.menuTitle, 0, positions.menu);
			ctx.drawImage(images[`robert0${state.robertFrame+1}`], positions.robert, 0);
			ctx.drawImage(images[`guillotineLarge0${state.guillotineFrame+1}`], positions.guillotine, 0);
			break;
		case 'GAME':
			if (countDown > 0) {
				const img = images[String(countDown)];
				ctx.drawImage(img, (config.width - img.width) / 2, (config.height - img.height) / 2);
			}
			for (const en of ennemies) {
				ctx.drawImage(images.guillotine, en.x, en.y);
			}

			for (let i = 0 ; i < state.lives ; ++i) {
				const heartSkin = i == state.lives - 1 ? state.lastLifeSkin : 'heart';
				ctx.drawImage(images[heartSkin], config.width - config.hud.livesMargin - (i + 1) * images.heart.width, config.hud.livesMargin);
			}

			// Character
			ctx.save();
			
			ctx.translate(character.position.x, character.position.y + images.character.height / 2);
			ctx.rotate(character.rotation * Math.PI / 180);
			ctx.translate(-character.position.x, -(character.position.y + images.character.height / 2));

			ctx.drawImage(images[character.skin], character.position.x - images.character.width / 2, character.position.y);
			ctx.restore();
			break;
		case 'END':
			ctx.drawImage(images.gameover, 0, 0);
			break;
		}
	}
}

app = new App();
