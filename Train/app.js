import * as lib from './lib.js'
const wait = lib.wait;

const config = {
	pixelPerfect: false,
	width: 720,
	height: 380,
	startScene: 'MENU',

	loadBar: {
		width: 200,
		height: 5,
	},

	camera: {
		smoothness: 0.8,
	},

	parallax: {
		strength: 0.1,
	},

	gravity: -9.81,
	train: {
		mass: 10000.0,
		backWheelsOffset: -36,
		frontWheelsOffset: +36,
		horizontalBoost: 2.0,
	},

	terrain: {
		clearPeriod: 5.0,
		landscape: {
			scale: 0.5,
			offset: { y: 30 },
		},
	},

	anim: {
		transitionToGame: {
			duration: 200,
			speed: 800,
		},
	},
};

// Use this any time you set the size/position of a DOM element
config.domPixelMultiplier = config.pixelPerfect ? 1.0 / window.devicePixelRatio : 1.0;

class App {
	constructor() {
		this.state = {
			needRedraw: true,
			audioContextAllowed: false,
			loading: { done: 0, total: 0 },
			scene: config.startScene,
			previousFrameTime: performance.now(),

			camera: {
				position: { x: 0, y: 0 },
				smoothPosition: { x: 0, y: 0 },
			},

			drag: {
				active: false,
				startMousePosition: { x: 0, y: 0 },
				startCameraPosition: { x: 0, y: 0 },
			},

			train: {
				angle: -10,
				position: {
					x: 70,
					y: 300,
				},
				velocity: {
					x: 0,
					y: 0,
					angle: 0,
				},
			},

			terrain: {
				startX: 0,
				startLandscapeX: 0,
				elevation: [],
				landscapeElevation: [],
				lastClear: performance.now() / 1000.0,
			},

			fx: [],

			transitionToGameStartTime: null,
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

		// Wait for images to be loaded before loading audio
		const $audio = $images.then(() => this.loadAudio())

		Promise.all([
			$dom,
			$images,
			// $audio -> Don't wait for audio before starting
		]).then(() => {
			this.start();
		});

		Promise.all([
			$dom,
			$audio
		]).then(() => {
			this.initDomDependentAudio();
		})
	}

	loadImages() {
		const { state, assets } = this;
		const { images, bboxes } = assets;

		const imageInfo = [
			//{ name: "shield", background: [255, 174, 201], computeContentBBox: true },
			{ name: "train", background: [200, 191, 231] },
			{ name: "title", background: [0, 0, 0] },

			{ name: "fullscreen", background: [255, 174, 201] },
			{ name: "fullscreenHover", background: [255, 174, 201] },
			{ name: "soundOn", background: [255, 174, 201] },
			{ name: "soundOnHover", background: [255, 174, 201] },
			{ name: "soundOff", background: [255, 174, 201] },
			{ name: "soundOffHover", background: [255, 174, 201] },
			{ name: "play", background: [255, 174, 201] },
			{ name: "playHover", background: [255, 174, 201] },
			{ name: "playPressed", background: [255, 174, 201] },
			{ name: "playHighlight", background: [255, 174, 201] },
		];

		state.loading.total += imageInfo.length;
		this.drawLoading();

		return Promise.all(
			imageInfo.map(async entry => {
				const image = await lib.fetchImage(`images/${entry.name}.png`);
				++state.loading.done;
				this.drawLoading();

				images[entry.name] = lib.replaceColorByAlpha(image, entry.background);
				if (entry.computeContentBBox) {
					bboxes[entry.name] = lib.computeImageContentBBox(images[entry.name]); 
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

	loadAudio() {
		const { assets, state } = this;
		const soundInfo = [
			//{ name: `bagCoins0${i + 1}` , type: "mp3"},
		]

		const audioCtx = new AudioContext();
		audioCtx.suspend();
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

	// If only there was a browser event we could listen for when navigator.userActivation.hasBeenActive changes...
	tryAllowingAudioContext() {
		return; // disable for now
		const { state, audio } = this;
		if (audio.context && !state.audioContextAllowed) {
			audio.context.resume().then(() => {
				if (!state.audioContextAllowed) {
					state.audioContextAllowed = true;
					this.onAudioContextAllowed();
				}
			});
		}
	}

	onAudioContextAllowed() {
		this.dom["soundOn-btn"].style.display = 'block';
		this.dom["soundOff-btn"].style.display = 'none';
		if (this.state.scene == 'MENU') {
			this.fadeInMenuMusic();
		}
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
			"soundOn-btn",
			"soundOn-btn-img",
			"soundOff-btn",
			"soundOff-btn-img",
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
		this.drawLoading();

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

		this.dom["soundOn-btn"].addEventListener("click", e => {
			this.dom["soundOff-btn"].style.display = 'block';
			this.dom["soundOn-btn"].style.display = 'none';
			this.turnSound(false);
		});

		this.dom["soundOff-btn"].addEventListener("click", e => {
			this.dom["soundOn-btn"].style.display = 'block';
			this.dom["soundOff-btn"].style.display = 'none';
			this.turnSound(true);
			
		});

		this.dom["fullscreen-btn"].addEventListener("click", e => {
			if (document.fullscreenElement) {
				screen.orientation.unlock();
				document.exitFullscreen();
			} else {
				this.dom.container.requestFullscreen();
				screen.orientation.lock('landscape').catch(err => console.log(`Could not lock landscape mode.`));
			}
		});

		const eventHandlers = [
			[ 'keydown', this.onKeyDown ],
			[ 'keyup', this.onKeyUp ],
			[ 'touchstart', this.onTouchStart ],
			[ 'touchend', this.onTouchEnd ],
			[ 'touchmove', this.onTouchMove ],
			[ 'touchcancel', this.onTouchCancel ],
			[ 'mousedown', this.onMouseDown ],
			[ 'mouseup', this.onMouseUp ],
			[ 'mousemove', this.onMouseMove ],
			[ 'mouseenter', this.onMouseEnter ],
		];
		for (const [eventName, handler] of eventHandlers) {
			document.addEventListener(eventName, ev => {
				this.tryAllowingAudioContext();
				handler.bind(this)(ev);
			});
		}
		new ResizeObserver(this.onResize.bind(this)).observe(this.dom.container);
		this.onResize();
	}

	initDomDependentAudio() {
		const audioCtx = this.audio.context;

		/*
		this.dom["menu-music-audio"].loop = true;
		const track = new MediaElementAudioSourceNode(audioCtx, {
			mediaElement: this.dom["menu-music-audio"],
		});
		const menuMusicMixer = new GainNode(audioCtx);
		track.connect(menuMusicMixer).connect(audioCtx.destination);
		this.audio.mixers.menuMusic = menuMusicMixer;

		if (this.state.audioContextAllowed) {
			this.fadeInMenuMusic();
		} else {
			this.tryAllowingAudioContext();
		}
		*/
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

		const remainingHeight = window.innerHeight - height;
		this.dom.about.style.height = `${remainingHeight / 2}px`;
		this.dom.about.style.display = remainingHeight > 400 && document.fullscreenElement == null ? 'block' : 'none';
	}

	onKeyDown(ev) {
		if (ev.key == "ArrowRight") {
			this.state.train.position.x += 10.0;
		}
	}

	onKeyUp(ev) {
	}

	// Called by stopDragging
	onClick(ev) {
	}

	mouseToScenePosition(mouse) {
		const { camera } = this.state;
		const { x, y } = mouse;
		const rect = this.dom.canvas.getBoundingClientRect();
		return {
			x: (x - rect.x) * (config.width / rect.width) - camera.smoothPosition.x,
			y: (y - rect.y) * (config.height / rect.height) - camera.smoothPosition.y,
		};
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
			if (!this.stopDragging()) {
				this.onClick(ev);
			}
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
		if (!this.stopDragging()) {
			this.onClick(ev);
		}
	}

	onTouchMove(ev) {
		this.updateDragging({ x: ev.touches[0].clientX, y: ev.touches[0].clientY });
	}

	onTouchCancel(ev) {
		this.cancelDragging({ x: ev.touches[0].clientX, y: ev.touches[0].clientY });
	}


	startDragging(position) {
		const { state } = this;
		const { drag } = state;
		if (drag.active) return;
		drag.active = true;
		drag.moved = false;
		drag.startCameraPosition = {...state.camera.position};
		drag.startMousePosition = position;
	}

	updateDragging(position) {
		const { state } = this;
		const { drag } = state;
		if (!drag.active) return;
		const deltaMouse = {
			x: position.x - drag.startMousePosition.x,
			y: position.y - drag.startMousePosition.y,
		};
		state.camera.position.x = drag.startCameraPosition.x + deltaMouse.x;
		state.camera.position.y = drag.startCameraPosition.y + deltaMouse.y;
		if (Math.abs(deltaMouse.x) > 2 || Math.abs(deltaMouse.y) > 2) {
			drag.moved = true;
		}
	}

	// return true iff there was a drag to end
	stopDragging() {
		const { state } = this;
		const { drag } = state;
		if (!drag.active) return false;
		drag.active = false;
		return drag.moved;
	}

	cancelDragging() {
		const { state } = this;
		const { drag } = state;
		if (!drag.active) return;
		drag.active = false;
		state.camera.position = {...drag.startCameraPosition};
	}

	start() {
		const { images, sounds } = this.assets;
		const autoSetupButton = (name, placement) => {
			lib.setupButton(config, {
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

		autoSetupButton("fullscreen", {
			top: 0,
			right: 0
		});
		autoSetupButton("soundOn", {
			top: 0,
			right: images.fullscreen.width,
		});
		autoSetupButton("soundOff", {
			top: 0,
			right: images.fullscreen.width,
		});
		autoSetupButton("play", {
			top: 70,
			right: 80
		});
		/*
		autoSetupButton("back", {
			top: 0,
			left: 0
		});
		autoSetupButton("about", {
			top: 100,
			right: 60
		});
		autoSetupButton("E", {
			bottom: 0,
			left: 0
		});
		this.dom[`fullscreen-btn-img`].style.opacity = this.dom.canvas.requestFullscreen ? 0.5 : 0.0;
		*/

		this.dom["fullscreen-btn"].style.display = 'block';
		this.dom["soundOff-btn"].style.display = 'block';

		// Play button animation
		const playButtonAnimation = async () => {
			const element = this.dom["play-btn-img"];
			if (element.dataset.hover != "true" && element.dataset.pressed != "true") {
				lib.setButtonImage(config, element, this.assets.images.playHighlight);
			}
			await wait(500);
			if (element.dataset.hover != "true" && element.dataset.pressed != "true") {
				lib.setButtonImage(config, element, this.assets.images.play);
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
		this.fadeInMenuMusic();
		this.resetTerrain();
	}

	stopMenu() {
		this.dom["play-btn"].style.display = 'none';
		this.dom["about-btn"].style.display = 'none';
		this.dom["E-btn"].style.display = 'none';
	}

	async fadeInMenuMusic() {
		if (!this.state.audioContextAllowed) return;
		const { menuMusic } = this.audio.mixers;
		if (!menuMusic) return;
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
		if (!menuMusic) return;
		const sound = this.dom["menu-music-audio"];

		for (let gain = menuMusic.gain.value ; gain >= 0.0 ; gain -= 0.02) {
			menuMusic.gain.value = Math.max(0.0, gain);
			await wait(20);
		}
		sound.pause();
	}

	startTransitionToGame() {
		// Test menu music is playing
		//const sound = this.dom["menu-music-audio"];
		//if (sound.paused) {
		//	this.fadeInMenuMusic();
		//}

		
		this.dom["play-btn"].style.display = 'none';
		this.dom["about-btn"].style.display = 'none';
		this.state.transitionToGameStartTime = performance.now();
		wait(config.anim.transitionToGame.duration)
		.then(() => {
			this.setScene('GAME');
		})
	}

	resetTerrain() {
		// Initialize elevation
		const { state } = this;
		const { terrain } = state;
		terrain.elevation = [
			{ dx: 0, y: 250 },
			{ dx: 100, y: 200 },
			{ dx: 100, y: 150 },
			{ dx: 50, y: 150 },
			{ dx: 100, y: 160 },
			{ dx: 50, y: 160 },
			{ dx: 100, y: 50 },
			{ dx: 100, y: 30 },
			{ dx: 100, y: 0 },
		];

		terrain.landscapeElevation = [
			{ dx: 0, y: 250 },
		];

		let x = terrain.startX;
		for (const point of terrain.elevation) {
			x += point.dx;
			point.x = x;
		}

		x = terrain.startLandscapeX;
		for (const point of terrain.landscapeElevation) {
			x += point.dx;
			point.x = x;
		}
	}

	startGame() {
	}

	ensureElevationUntil(targetX) {
		const { elevation, landscapeElevation } = this.state.terrain;
		while (elevation[elevation.length - 1].x < targetX) {
			const prev = elevation[elevation.length - 1];
			const dx = lib.lerp(50, 150, Math.random());
			const y = lib.lerp(prev.y + 20, prev.y - 80, Math.random());
			elevation.push({
				x: prev.x + dx,
				dx, y
			});
		}

		const { scale } = config.terrain.landscape;
		while (landscapeElevation[landscapeElevation.length - 1].x < (targetX - config.width) * scale + config.width) {
			const prev = landscapeElevation[landscapeElevation.length - 1];
			const dx = lib.lerp(50, 150, Math.random());
			const x = prev.x + dx;
			const hit = this.terrainAt(x / scale);
			const y = lib.lerp(hit.position.y + 20 * scale, hit.position.y - 80 * scale, Math.random());
			landscapeElevation.push({
				x, dx, y
			});
		}
	}

	clearElevationUntil(targetX) {
		const { terrain } = this.state;
		const { scale } = config.terrain.landscape;

		{
			let clearIdx = 0;
			for (const point of terrain.elevation) {
				if (point.x >= targetX) break;
				++clearIdx;
			}
			if (clearIdx > 0) {
				const prev = terrain.elevation[clearIdx - 1];
				terrain.elevation = terrain.elevation.slice(clearIdx);
				terrain.startX = prev.x;
			}
		}

		{
			let clearIdx = 0;
			for (const point of terrain.landscapeElevation) {
				if (point.x >= targetX * scale) break;
				++clearIdx;
			}
			if (clearIdx > 0) {
				const prev = terrain.landscapeElevation[clearIdx - 1];
				terrain.landscapeElevation = terrain.landscapeElevation.slice(clearIdx);
				terrain.startLandscapeX = prev.x;
			}
		}
	}

	stopGame() {
	}

	startEnd() {
	}

	stopEnd() {
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
		const { state, assets } = this;
		const { camera, target, train, terrain } = state;

		camera.position.x = 50 - train.position.x;
		camera.position.y = -270 + train.position.y;

		camera.smoothPosition.x = lib.lerp(camera.position.x, camera.smoothPosition.x, config.camera.smoothness);
		camera.smoothPosition.y = lib.lerp(camera.position.y, camera.smoothPosition.y, config.camera.smoothness);

		// Train dynamics
		train.position.x += train.velocity.x * dt;
		const trainAngleRadians = train.angle * Math.PI / 180;
		const c = Math.cos(trainAngleRadians);
		const s = -Math.sin(trainAngleRadians);
		const frontWheelsX = train.position.x + config.train.frontWheelsOffset * c;
		const backWheelsX = train.position.x + config.train.backWheelsOffset * c;
		const prevFrontWheelsY = train.position.y + config.train.frontWheelsOffset * s;
		const prevBackWheelsY = train.position.y + config.train.backWheelsOffset * s;

		const minFrontWheelsY = this.terrainAt(frontWheelsX).position.y;
		const minBackWheelsY = this.terrainAt(backWheelsX).position.y;
		const frontWheelsY = Math.max(minFrontWheelsY, prevFrontWheelsY + train.velocity.y * dt);
		const backWheelsY = Math.max(minBackWheelsY, prevBackWheelsY + train.velocity.y * dt);
		const prevTrainY = train.position.y;
		train.position.y = (frontWheelsY + backWheelsY) / 2.0;
		const deltaX = backWheelsX - frontWheelsX;
		const deltaY = backWheelsY - frontWheelsY;
		const trainPrevAngle = train.angle;
		train.angle = Math.atan2(deltaY, -deltaX) * 180 / Math.PI;

		//train.velocity.y = (train.position.y - prevTrainY) / dt;

		const isFrontWheelGrounded = Math.abs(frontWheelsY - minFrontWheelsY) < 1e-4;
		const isBackWheelGrounded = Math.abs(backWheelsY - minBackWheelsY) < 1e-4;
		if (isFrontWheelGrounded && isBackWheelGrounded) {
			const acc = 0.005;
			const s = Math.sin(train.angle * Math.PI / 180);
			const boost = s > 0 ? config.train.horizontalBoost : 1.0;
			train.velocity.x += -s * boost * config.gravity / config.train.mass * dt;
			train.velocity.y = -0.1;
		} else {
			train.velocity.y += config.gravity / config.train.mass * dt;
		}
		const dragFactor = 0.0001;
		train.velocity.x -= dragFactor * train.velocity.x * train.velocity.x * dt;

		if (isFrontWheelGrounded || isBackWheelGrounded) {
			train.velocity.angle = (train.angle - trainPrevAngle) / dt;
		} else {
			train.angle += train.velocity.angle * dt;
			train.angle = Math.min(Math.max(-70, train.angle), 70);
			if (Math.abs(train.angle) > 60) {
				train.velocity.angle += -0.1 * Math.sign(train.angle);
			}
		}

		state.fx = state.fx.filter(fx => !fx.isDestroyed);
		state.fx.push({
			draw: ctx => {
				//ctx.strokeStyle = "rgb(0, 255, 0)";
				//ctx.beginPath();
				//ctx.moveTo(frontWheelsX, config.height - frontWheelsY);
				//ctx.lineTo(frontWheelsX, config.height - frontWheelsY + 20);
				//ctx.stroke();
			},
			isDestroyed: true, // takes effect next frame
		});

		state.needRedraw = true;
	}

	terrainAt(targetX) {
		const { state } = this;
		const { terrain } = state;

		if (targetX < 0 || terrain.elevation.length == 0) return null;
		let x = terrain.startX;
		let prevY = terrain.elevation[0];
		let segmentIdx = 0;
		for (const point of terrain.elevation) {
			const prevX = x;
			x += point.dx;
			if (x >= targetX) {
				const fac = (targetX - prevX) / (x - prevX);
				return {
					identifier: {
						segment: segmentIdx,
						position: fac,
					},
					position: {
						x: targetX,
						y: lib.lerp(prevY, point.y, fac),
					}
				}
			}
			prevY = point.y;
			++segmentIdx;
		}
		return {
			identifier: null,
			position: {
				x: targetX,
				y: prevY,
			}
		}
	}

	playSound(soundName, loop) {
		const audioCtx = this.audio.context;
		if (audioCtx.state != 'running') return;

		const soundData = this.assets.sounds[soundName];
		if (!soundData) return;

		const source = audioCtx.createBufferSource();
		source.buffer = soundData;
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

	turnSound(on) {
		const audioCtx = this.audio.context;
		if (on) {
			audioCtx.resume();
		} else {
			audioCtx.suspend();
		}
	}

	drawLoading() {
		const ctx = this.context2d;
		const { loading } = this.state;
		if (!ctx) return;

		// Background
		ctx.fillStyle = "rgb(0, 0, 0)";
		ctx.fillRect(0, 0, config.width, config.height);

		// Progress background
		ctx.fillStyle = "rgb(127, 127, 127)";
		ctx.fillRect(
			(config.width - config.loadBar.width) / 2,
			(config.height - config.loadBar.height) / 2,
			config.loadBar.width,
			config.loadBar.height
		);

		// Progress foreground
		if (loading.total > 0 && loading.done > 0) {
			const fac = loading.done / loading.total;
			ctx.fillStyle = "rgb(255, 255, 255)";
			ctx.fillRect(
				(config.width - config.loadBar.width) / 2,
				(config.height - config.loadBar.height) / 2,
				config.loadBar.width * fac,
				config.loadBar.height
			);
		}
	}

	draw() {
		const { state } = this;
		const { scene, camera, train, terrain } = state;
		const { images, bboxes } = this.assets;
		const ctx = this.context2d;

		ctx.fillStyle = "rgb(200, 191, 231)";
		ctx.fillRect(0, 0, config.width, config.height);

		switch (scene) {

		case 'MENU': // pass through
		case 'GAME':
			const t = performance.now() / 1000.0;

			this.ensureElevationUntil(-camera.smoothPosition.x + config.width);
			if (t - terrain.lastClear > config.terrain.clearPeriod) {
				this.clearElevationUntil(-camera.smoothPosition.x - config.width / 2);
				terrain.lastClear = t;
			}

			{ // Background
				ctx.save();
				ctx.translate(camera.smoothPosition.x * config.terrain.landscape.scale, camera.smoothPosition.y);

				ctx.fillStyle = "rgb(255, 255, 255)";
				ctx.beginPath();
				let x = terrain.startLandscapeX;
				ctx.moveTo(x, config.height - camera.smoothPosition.y);
				for (const point of terrain.landscapeElevation) {
					x += point.dx;
					ctx.lineTo(x, config.height - point.y - config.terrain.landscape.offset.y);
				}
				ctx.lineTo(x, config.height - camera.smoothPosition.y);
				ctx.fill();

				ctx.restore();
			}

			{ // Foreground
				ctx.save();
				ctx.translate(camera.smoothPosition.x, camera.smoothPosition.y);

				ctx.fillStyle = "rgb(163, 73, 164)";
				ctx.beginPath();
				let x = terrain.startX;
				ctx.moveTo(x, config.height - camera.smoothPosition.y);
				for (const point of terrain.elevation) {
					x += point.dx;
					ctx.lineTo(x, config.height - point.y);
					if (x > -camera.smoothPosition.x + config.width) break;
				}
				ctx.lineTo(x, config.height - camera.smoothPosition.y);
				ctx.fill();

				lib.drawSprite(
					ctx,
					images.train,
					train.position.x,
					config.height - train.position.y,
					train.angle,
					{
						pivot: {
							x: 0.5,
							y: 1.0,
						}
					}
				);

				for (const fx of state.fx) {
					fx.draw(ctx);
				}

				ctx.restore();
			}

			if (scene == 'MENU') {
				const positions = {
					title: 0,
				};
				if (this.state.transitionToGameStartTime != null) {
					const time = (performance.now() - this.state.transitionToGameStartTime) / 1000.0;
					const { speed } = config.anim.transitionToGame;
					positions.title = Math.max(time, 0.0) * speed;
				}

				ctx.drawImage(images.title, 0, positions.title);
			}
			break;

		case 'END':
			break;
		}
	}
}

const app = new App();
