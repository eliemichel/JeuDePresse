const config = {
	startScene: 'MENU',
	shieldSpeed: 0.75,
	width: 720,
	height: 380,
	countDownDelay: 1000, // ms between each number
	pixelPerfect: false, // display in the exact 380x720 resolution, whichever the window size and pixel density

	putinPositionX: 580,
	putinCanonOffset: {
		x: -25,
		y: 13,
	},
	startCorruption: 4,
	maximumCorruption: 9, // M€
	corruptionPerProjectile: 1,
	uncorruptionPerProjectile: 1,
	initialProjectileVelocity: {
		min: {
			angle: 20.0,
			magnitude: 0.9 * 0.7,
		},
		max: {
			angle: 70.0,
			magnitude: 1.3 * 0.7,
		},
	},
	bounceProjectileVelocity: {
		x: 0.8 * 0.7,
		y: 0.6 * 0.7,
	},
	anim: {
		putinSleeps: {
			duration: 3000, // ms
			blinkDuration: 500, // ms
		},
		putinFires: {
			start: 2000,
			wait: {
				min: 500,
				max: 2000,
			},
		},
		impact: {
			offset: { x: 40 },
			frameDuration: 50,
		},
		transitionToGame: {
			duration: 1100,
			speed: 400,
		},
	},
	gravity: 0.0025 * 0.5,
	aboutUrl: "https://eliemichel.github.io/JeuDePresse/Alexei/about",
	defaultLives: 3,
	hud: {
		livesMargin: 5,
	},
	menuMusicVolume: 0.5,
	difficultyIncrementTime: 5000,
	ennemySkinFromType: {
		'GUILLOTINE': "guillotine",
		'HEART': "heartMob",
	},

	// == DEBUG ==
	//countDownDelay: 100,
	startScene: 'MENU',
	//defaultLives: 10,
	//difficultyIncrementTime: 5000,
	// ==  ==
};

// Use this any time you set the size/position of a DOM element
config.domPixelMultiplier = config.pixelPerfect ? 1.0 / window.devicePixelRatio : 1.0;

const zip = (...rows) => [...rows[0]].map((_,c) => rows.map(row => row[c]));

function wait(ms) {
	return new Promise(resolve => { setTimeout(resolve, ms); });
}

const lerp = (a, b, t) => a * (1.0 - t) + b * t;

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

function samplePatternIndex(difficulty, distributions) {
	let likelihoods = [];
	for (const dist of distributions) {
		if (dist.fromDifficulty > difficulty) {
			break;
		}
		likelihoods = dist.likelihoods;
	}
	const total = likelihoods.reduce((s, x) => s + x, 0);
	let sample = Math.floor(Math.random() * total);
	let patternIdx = 0;
	for (const l of likelihoods) {
		sample -= l;
		if (sample < 0) {
			break;
		}
		patternIdx += 1;
	}
	return Math.min(patternIdx, likelihoods.length - 1);
}

class App {
	constructor() {
		this.state = {
			needRedraw: true,
			scene: 'MENU', // of [ 'MENU', 'GAME', 'END' ]
			victory: false,
			corruption: config.startCorruption,
			shield: {
				position: { x: 360, y: config.height / 2 },
				movingUp: false,
				movingDown: false,
			},
			projectiles: [],
			countDown: 0,
			drag: {
				active: false,
				startShieldPosition: { y: 0 },
				startPosition: { y: 0 },
			},
			isPutinAsleep: false,
			putinSleepStarted: null,

			transitionToGameStartTime: null,
			previousFrameTime: performance.now(),
			difficulty: 0,

			fx: [],
		};
		this.assets = {
			images: {},
			bboxes: {},
			sounds: {},
		};
		this.dom = {};
		this.audio = {
			context: null,
			mixers: {},
		};

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
			{ name: "shield", background: [255, 174, 201], computeContentBBox: true },
			{ name: "thuneB", background: [255, 174, 201], computeContentBBox: true },
			{ name: "europe", background: [255, 174, 201] },
			{ name: "gaugeEmpty", background: [255, 174, 201], computeContentBBox: true },
			{ name: "gaugeFull", background: [255, 174, 201] },
			{ name: "corruption", background: [255, 174, 201] },
			{ name: "gameover", background: null },
			{ name: "poutineSmall", background: [255, 174, 201] },
			{ name: "poutineSmallAsleep", background: [255, 174, 201] },
			{ name: "canon", background: [255, 174, 201] },
			{ name: "victoire", background: null },
			{ name: "menuFlags", background: [255, 174, 201] },
			{ name: "menuPutin", background: [255, 174, 201] },
			{ name: "menuTitle", background: [255, 174, 201] },
			{ name: "menuLepen", background: [255, 174, 201] },
			{ name: "lepen", background: [255, 174, 201], computeContentBBox: true },
			{ name: "impact01", background: [255, 174, 201] },
			{ name: "impact02", background: [255, 174, 201] },
			{ name: "impact03", background: [255, 174, 201] },

			{ name: "play", background: [255, 174, 201] },
			{ name: "playHover", background: [255, 174, 201] },
			{ name: "playPressed", background: [255, 174, 201] },
			{ name: "playHighlight", background: [255, 174, 201] },
			{ name: "about", background: [255, 174, 201] },
			{ name: "aboutHover", background: [255, 174, 201] },
			{ name: "aboutPressed", background: [255, 174, 201] },
			{ name: "back", background: [255, 174, 201] },
			{ name: "backHover", background: [255, 174, 201] },
			{ name: "backPressed", background: [255, 174, 201] },
			{ name: "fullscreen", background: [255, 174, 201] },
			{ name: "fullscreenHover", background: [255, 174, 201] },
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
			...Array.from({length: 7}, (_, i) => ({ name: `bagCoins0${i + 1}` , type: "mp3"})),
			...Array.from({length: 6}, (_, i) => ({ name: `womanFallQuick0${i + 1}` , type: "mp3"})),
			{ name: "coinsHit01", type: "mp3" },
			...Array.from({length: 5}, (_, i) => ({ name: `metalHit0${i + 1}` , type: "mp3"})),
			{ name: "concreteSmash", type: "mp3" },
			...Array.from({length: 23}, (_, i) => ({ name: `manPainSilly${(i + 1 + "").padStart(2, "0")}` , type: "mp3"})),
		]

		const audioCtx = new AudioContext();
		this.audio.context = audioCtx;

		// Create mixers for each sound group
		const throwMixer = new GainNode(audioCtx);
		throwMixer.connect(audioCtx.destination);
		throwMixer.gain.value = 0.5;
		this.audio.mixers.throw = throwMixer;

		const shieldMixer = new GainNode(audioCtx);
		shieldMixer.connect(audioCtx.destination);
		shieldMixer.gain.value = 0.7;
		this.audio.mixers.shield = shieldMixer;

		const globalMixer = new GainNode(audioCtx);
		globalMixer.connect(audioCtx.destination);
		this.audio.mixers.global = globalMixer;


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
			"about-btn",
			"about-btn-img",
			"back-btn",
			"back-btn-img",
			"E-btn",
			"E-btn-img",
			"fullscreen-btn",
			"fullscreen-btn-img",
			"about",
			"menu-music-audio",
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

		this.dom["about-btn"].addEventListener("click", e => {
			window.open(config.aboutUrl, '_blank');
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
				screen.orientation.lock('landscape').catch(err => console.log(`Could not lock landscape mode.`));
				if (this.state.scene == 'MENU') {
					this.fadeInMenuMusic();
				}
			}
		});

		// Init DOM-dependent sound
		const audioCtx = this.audio.context;
		this.dom["menu-music-audio"].loop = true;
		const track = new MediaElementAudioSourceNode(audioCtx, {
			mediaElement: this.dom["menu-music-audio"],
		});
		const menuMusicMixer = new GainNode(audioCtx);
		track.connect(menuMusicMixer).connect(audioCtx.destination);
		this.audio.mixers.menuMusic = menuMusicMixer;

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

	onKeyDown(ev) {
		const { shield } = this.state;
		if (ev.key == 'ArrowUp') {
			shield.movingUp = true;
		}
		if (ev.key == 'ArrowDown') {
			shield.movingDown = true;
		}

		// Debug
		if (ev.key == 'a') {
			this.triggerPoutineFire();
		}
	}

	onKeyUp(ev) {
		const { shield } = this.state;
		if (ev.key == 'ArrowUp') {
			shield.movingUp = false;
		}
		if (ev.key == 'ArrowDown') {
			shield.movingDown = false;
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
		const { drag, shield } = this.state;
		drag.active = true;
		drag.startShieldPosition.y = shield.position.y;
		drag.startPosition.y = position.y;
	}

	updateDragging(position) {
		const { drag, shield } = this.state;
		if (!drag.active) return;
		const deltaY = position.y - drag.startPosition.y;
		shield.position.y = drag.startShieldPosition.y + deltaY;
		shield.position.y = Math.min(Math.max(0, shield.position.y), config.height);
	}

	stopDragging() {
		const { drag } = this.state;
		drag.active = false;
	}

	cancelDragging() {
		const { drag, shield } = this.state;
		drag.active = false;
		shield.position.y = drag.startShieldPosition.y;
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

		autoSetupButton("back", {
			top: 0,
			left: 0
		});
		autoSetupButton("fullscreen", {
			top: 0,
			right: 0
		});
		autoSetupButton("play", {
			top: 40,
			right: 60
		});
		autoSetupButton("about", {
			top: 100,
			right: 60
		});
		/*
		autoSetupButton("E", {
			bottom: 0,
			left: 0
		});
		this.dom[`fullscreen-btn-img`].style.opacity = this.dom.canvas.requestFullscreen ? 0.5 : 0.0;
		*/

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
		this.dom["about-btn"].style.display = 'block';
		this.dom["E-btn"].style.display = 'block';
		this.dom["fullscreen-btn"].style.display = 'block';
		this.fadeInMenuMusic();
	}

	stopMenu() {
		this.dom["play-btn"].style.display = 'none';
		this.dom["about-btn"].style.display = 'none';
		this.dom["E-btn"].style.display = 'none';
		this.dom["fullscreen-btn"].style.display = 'none';
	}

	async fadeInMenuMusic() {
		const { menuMusic } = this.audio.mixers;
		const sound = this.dom["menu-music-audio"];

		menuMusic.gain.value = 0.0;
		sound.play();

		for (let gain = menuMusic.gain.value ; gain <= 1.0 ; gain += 0.02) {
			menuMusic.gain.value = Math.min(gain, 1.0) * config.menuMusicVolume;
			await wait(20);
		}
	}

	async fadeOutMenuMusic() {  // NOTE not used in current game
		const { menuMusic } = this.audio.mixers;
		const sound = this.dom["menu-music-audio"];

		for (let gain = menuMusic.gain.value ; gain >= 0.0 ; gain -= 0.02) {
			menuMusic.gain.value = Math.max(0.0, gain);
			await wait(20);
		}
		sound.pause();
	}

	startTransitionToGame() {
		// Test menu music is playing
		const sound = this.dom["menu-music-audio"];
		if (sound.paused) {
			this.fadeInMenuMusic();
		}

		
		this.dom["play-btn"].style.display = 'none';
		this.dom["about-btn"].style.display = 'none';
		this.state.transitionToGameStartTime = performance.now();
		wait(config.anim.transitionToGame.duration)
		.then(() => {
			this.setScene('GAME');
		})
	}

	startGame() {
		const { state } = this;
		this.dom["fullscreen-btn"].style.display = 'block';
		this.restartGameAfterHit();
		this.startCountDown();

		// Poutine fires
		(async () => {
			const { start, wait: range } = config.anim.putinFires;
			await wait(start);
			while (state.scene == 'GAME') {
				if (!state.isPutinAsleep) {
					this.triggerPoutineFire();
				}
				await wait(lerp(range.min, range.max, Math.random()));
			}
		})();
	}

	restartGameAfterHit() {
		const { state } = this;
		state.victory = false;
		state.corruption = config.startCorruption;
		state.projectiles = [];
		state.shield.position = { x: 280, y: config.height / 2 };
		state.putinSleepStarted = null;
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

	triggerPoutineFire() {
		const { state } = this;
		console.log("Poutine fires!");

		const fac = Math.random();
		//const velocity = {
		//	x: -lerp(config.initialProjectileVelocity.min.x, config.initialProjectileVelocity.max.x, fac),
		//	y: -lerp(config.initialProjectileVelocity.min.y, config.initialProjectileVelocity.max.y, fac),
		//};
		const velocity = {
			angle: lerp(config.initialProjectileVelocity.min.angle, config.initialProjectileVelocity.max.angle, fac),
			magnitude: lerp(config.initialProjectileVelocity.min.magnitude, config.initialProjectileVelocity.max.magnitude, fac),
		};
		const radians = velocity.angle * Math.PI / 180;
		velocity.x = -velocity.magnitude * Math.cos(radians);
		velocity.y = -velocity.magnitude * Math.sin(radians);

		state.projectiles.push({
			skin: "lepen",
			position: { x: 600, y: 270 },
			velocity,
			isDestroyed: false,
			corruption: config.corruptionPerProjectile,
			uncorruption: config.uncorruptionPerProjectile,
		});

		this.playSound(`bagCoins0${Math.floor(Math.random() * 7) + 1}`);		
		this.playSound(`womanFallQuick0${Math.floor(Math.random() * 6) + 1}`);
	}

	onShieldHit(projectile) {
		const { state, assets } = this;
		const { shield } = state;

		const projectileCenterY = projectile.position.y - assets.images[projectile.skin].height / 2;
		const deltaY = shield.position.y - projectileCenterY;

		projectile.velocity.x = Math.abs(projectile.velocity.x);
		projectile.velocity.y += -config.bounceProjectileVelocity.y * deltaY * 0.02;

		this.playSound(`coinsHit01`);
		this.playSound(`metalHit0${Math.floor(Math.random() * 5) + 1}`);

		// Impact effect
		const fx = {
			skin: "impact01",
			position: {
				x: shield.position.x + config.anim.impact.offset.x,
				y: projectile.position.y,
			},
			isDestroyed: false,
		};
		state.fx.push(fx);
		(async () => {
			await wait(config.anim.impact.frameDuration);
			fx.skin = "impact02";
			await wait(config.anim.impact.frameDuration);
			fx.skin = "impact03";
			await wait(config.anim.impact.frameDuration);
			fx.isDestroyed = true;
		})();
	}

	onEuropeHit(projectile) {
		const { state } = this;

		this.playSound(`concreteSmash`);

		state.corruption += projectile.corruption;
		projectile.isDestroyed = true;

		if (state.corruption >= config.maximumCorruption) {
			this.startGameOver();
		}
	}

	async onPutinHit(projectile) {
		const { state } = this;

		if (state.isPutinAsleep) return;

		state.corruption -= projectile.uncorruption;
		projectile.isDestroyed = true;

		if (state.corruption <= 0) {
			this.startVictory();
		}

		this.playSound(`manPainSilly${(
			Math.floor(Math.random() * 23) + 1 + "").padStart(2, "0")}`
		);

		state.isPutinAsleep = true;
		state.putinSleepStarted = performance.now();
		await wait(config.anim.putinSleeps.duration);
		state.putinSleepStarted = null;
		state.isPutinAsleep = false;
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
		this.state.victory = false;
		this.setScene('END');
	}

	startVictory() {
		this.state.victory = true;
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
		state.scene = newScene;
		switch (state.scene) {
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
		const { shield, projectiles } = state;

		// Character update
		if (shield.movingDown) {
			shield.position.y += config.shieldSpeed * dt;
		}
		if (shield.movingUp) {
			shield.position.y -= config.shieldSpeed * dt;
		}
		shield.position.y = Math.min(Math.max(0, shield.position.y), config.height);

		// Projectile update
		for (const proj of projectiles) {
			proj.position.x += proj.velocity.x * dt;
			proj.position.y += proj.velocity.y * dt;
			proj.velocity.y += config.gravity * dt;
		}

		// Collision detection
		for (const proj of projectiles) {
			const hasBounced = proj.velocity.x > 0;
			const projBbox = bboxOffset(
				bboxes[proj.skin],
				proj.position.x - images[proj.skin].width / 2.0,
				proj.position.y - images[proj.skin].height / 2.0
			);

			// Collision with shield
			const collidesShield = !hasBounced && !bboxIsEmpty(bboxIntersection(
				projBbox,
				bboxOffset(bboxes.shield, shield.position.x, shield.position.y - images.shield.height / 2.0),
			));

			if (collidesShield) {
				this.onShieldHit(proj);
			}

			// Collision with Europe
			const lowerLeft = {
				x: projBbox.minx,
				y: projBbox.maxy,
			};
			const lowerLeftHit = isOpaqueAt(images.europe, lowerLeft);
			const collidesEurope = lowerLeftHit;

			if (collidesEurope) {
				this.onEuropeHit(proj);
			}

			// Collision with Putin
			const poutinePosition = {
				x: config.putinPositionX,
				y: config.height - images.poutineSmall.height,
			};
			const localProjBbox = bboxOffset(
				projBbox,
				-poutinePosition.x,
				-poutinePosition.y,
			);
			const lowerRight = {
				x: localProjBbox.maxx,
				y: localProjBbox.maxy,
			};
			const lowerRightHit = isOpaqueAt(images.poutineSmall, lowerRight);
			const collidesPutin = hasBounced && lowerRightHit;

			if (collidesPutin) {
				this.onPutinHit(proj);
			}
		}

		// Remove ennemies that are below the screen
		state.projectiles = state.projectiles.filter(proj => !proj.isDestroyed && proj.position.y < config.height);

		state.fx = state.fx.filter(fx => !fx.isDestroyed);

		state.needRedraw = true;
	}

	playSound(soundName, loop) {
		const audioCtx = this.audio.context;
		const source = audioCtx.createBufferSource();
		source.buffer = this.assets.sounds[soundName];
		if (soundName.includes("womanFallQuick")) {
			source.connect(this.audio.mixers.throw);
		} else if (soundName.includes("metalHit")) {
			source.connect(this.audio.mixers.shield);
		}
		else {
			source.connect(this.audio.mixers.global);
		}
		source.loop = !!loop;
		source.start();
	}

	draw() {
		const { state } = this;
		const { scene, shield, countDown } = state;
		const { images, bboxes } = this.assets;
		const ctx = this.context2d;

		switch (scene) {

		case 'MENU':
			const positions ={
				flags: 0,
				title: 0,
				putin: 0,
				lepen: { x: 0, y: 0 },
			};
			if (this.state.transitionToGameStartTime != null) {
				const time = (performance.now() - this.state.transitionToGameStartTime) / 1000.0;
				const speed = config.anim.transitionToGame.speed;
				const fac = time * speed - speed * 0.5 * Math.sin(Math.PI * Math.exp(-time));
				positions.lepen.x = -1.5*2.0 * fac;
				positions.lepen.y = -1.0*2.0 * fac;
				positions.putin = Math.max(time - 0.1, 0.0) * speed;
				positions.flags = Math.max(time - 0.2, 0.0) * speed;
				positions.title = -Math.max(time - 0.3, 0.0) * speed;
			}

			ctx.fillStyle = "rgb(239, 228, 176)";
			ctx.fillRect(0, 0, config.width, config.height);
			ctx.drawImage(images.menuFlags, 0, positions.flags);
			ctx.drawImage(images.menuTitle, 0, positions.title);
			ctx.drawImage(images.menuPutin, 0, positions.putin);
			ctx.drawImage(images.menuLepen, positions.lepen.x, positions.lepen.y);
			break;

		case 'GAME':
			ctx.fillStyle = "rgb(239, 228, 176)";
			ctx.fillRect(0, 0, config.width, config.height);

			let putinSkin = "poutineSmall";
			if (state.isPutinAsleep) {
				const ellapsed = performance.now() - state.putinSleepStarted;
				if ((ellapsed / config.anim.putinSleeps.blinkDuration) % 1 < 0.5) {
					putinSkin = "poutineSmallAsleep";
				}
			}
			const img = images[putinSkin];
			ctx.drawImage(img, config.putinPositionX, config.height - img.height);
			ctx.drawImage(images.canon, config.putinPositionX + config.putinCanonOffset.x, config.height - img.height + config.putinCanonOffset.y);
			ctx.drawImage(images.europe, 0, 0);
			ctx.drawImage(images.shield, shield.position.x, shield.position.y - images.shield.height / 2.0);

			for (const proj of state.projectiles) {
				const img = images[proj.skin];
				ctx.drawImage(img, proj.position.x - img.width / 2.0, proj.position.y - img.height / 2.0);
			}

			for (const fx of state.fx) {
				const img = images[fx.skin];
				ctx.drawImage(img, fx.position.x - img.width / 2.0, fx.position.y - img.height / 2.0);
			}

			// HUD
			ctx.drawImage(images.corruption, 236, 0);
			ctx.drawImage(images.gaugeEmpty, 0, 0);

			ctx.save();
			ctx.beginPath();
			const fac = state.corruption / config.maximumCorruption;
			const clipX = bboxes.gaugeEmpty.minx + (bboxes.gaugeEmpty.maxx - bboxes.gaugeEmpty.minx) * fac;
			ctx.rect(0, 0, clipX, images.gaugeEmpty.height);
			ctx.clip();
			ctx.drawImage(images.gaugeFull, 0, 0);
			ctx.restore();
			break;

		case 'END':
			ctx.drawImage(state.victory ? images.victoire : images.gameover, 0, 0);
			break;
		}
	}
}

app = new App();
