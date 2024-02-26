import * as lib from './lib.js'
const wait = lib.wait;

const config = {
	pixelPerfect: false,
	width: 720,
	height: 380,
	startScene: 'GAME',

	loadBar: {
		width: 200,
		height: 5,
	},

	camera: {
		smoothness: 0.7,
	},

	character: {
		maxSpeed: 0.2,
		angleSmoothness: 0.55,
		footprint: {
			period: 0.1,
			fadeout: {
				start: 3.0,
				duration: 5.0,
			}
		},
	},

	parallax: {
		strength: 0.1,
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

			camera: {
				position: { x: 0, y: 0 },
				smoothPosition: { x: 0, y: 0 },
			},

			drag: {
				active: false,
				startMousePosition: { x: 0, y: 0 },
				startCameraPosition: { x: 0, y: 0 },
			},

			character: {
				angle: 0,
				position: {
					x: config.width / 2,
					y: config.height / 2,
				},
				action: 'idle',
				lastFootprint: performance.now() / 1000.0,
			},

			target: {
				active: false,
				position: { x: 0, y: 0 },
			},

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
			{ name: "tree01_01", background: [0, 0, 0], fill: [255, 255, 255] },
			{ name: "tree01_02", background: [0, 0, 0], fill: [195, 195, 195] },
			{ name: "tree01_03", background: [0, 0, 0], fill: [127, 127, 127] },

			{ name: "tree02_01", background: [0, 0, 0], fill: [255, 255, 255] },
			{ name: "tree02_02", background: [0, 0, 0], fill: [195, 195, 195] },
			{ name: "tree02_03", background: [0, 0, 0], fill: [127, 127, 127] },
			{ name: "tree02_04", background: [0, 0, 0], fill: [65, 65, 65] },

			{ name: "character_idle01", background: [0, 0, 0] },
			{ name: "character_idle02", background: [0, 0, 0] },
			{ name: "character_walk01", background: [0, 0, 0] },
			{ name: "character_walk02", background: [0, 0, 0] },

			{ name: "footsteps", background: [0, 0, 0] },
			{ name: "farm", background: [0, 0, 0] },

			{ name: "target", background: [0, 0, 0] },
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
	}

	onKeyUp(ev) {
	}

	// Called by stopDragging
	onClick(ev) {
		const { state } = this;
		const { target } = state;
		const mouse = { x: ev.clientX, y: ev.clientY };
		target.active = true;
		target.position = this.mouseToScenePosition(mouse);
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
		autoSetupButton("back", {
			top: 0,
			left: 0
		});
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
			top: 40,
			right: 60
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
		

		this.dom["fullscreen-btn"].style.display = 'block';
		this.dom["soundOff-btn"].style.display = 'block';

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
		*/

		this.setScene(config.startScene);
		requestAnimationFrame(this.onFrame.bind(this));
	}

	startMenu() {
		this.state.transitionToGameStartTime = null;
		this.dom["play-btn"].style.display = 'block';
		this.dom["about-btn"].style.display = 'block';
		this.dom["E-btn"].style.display = 'block';
		this.fadeInMenuMusic();
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
		const { state } = this;
		const { camera, target, character } = state;

		camera.smoothPosition.x = lib.lerp(camera.position.x, camera.smoothPosition.x, config.camera.smoothness);
		camera.smoothPosition.y = lib.lerp(camera.position.y, camera.smoothPosition.y, config.camera.smoothness);

		// Walk towards target
		if (target.active) {
			const dx = target.position.x - character.position.x;
			const dy = target.position.y - character.position.y;
			const angle = Math.atan2(dy, dx);
			const distance = Math.sqrt(dx * dx + dy * dy);
			const speed = Math.min(distance / dt, config.character.maxSpeed);
			character.angle = lib.lerpAngles(angle / Math.PI * 180.0, character.angle, config.character.angleSmoothness);
			character.position.x += speed * Math.cos(character.angle * Math.PI / 180) * dt;
			character.position.y += speed * Math.sin(character.angle * Math.PI / 180) * dt;

			const t = performance.now() / 1000.0;
			if (t - character.lastFootprint > config.character.footprint.period) {
				this.emitFootprints();
			}

			if (speed < config.character.maxSpeed) {
				target.active = false;
			}
		}

		character.action = target.active ? 'walk' : 'idle';

		state.fx = state.fx.filter(fx => !fx.isDestroyed);

		state.needRedraw = true;
	}

	emitFootprints() {
		const { state, assets } = this;
		const { character, fx } = state;
		const { images } = assets;
		
		character.lastFootprint = performance.now() / 1000.0;

		const footprints = {
			position: {...character.position},
			angle: character.angle + 90,
			skin: images.footsteps,
			fadeoutStartTime: null,
			isDestroyed: false,
		};
		fx.push(footprints);

		const { fadeout } = config.character.footprint;

		footprints.getOpacity = t => {
			if (footprints.fadeoutStartTime === null) {
				return 1.0;
			} else {
				const tt = (t - footprints.fadeoutStartTime) / fadeout.duration;
				return Math.max(1.0 - tt, 0.0);
			}
		}
				

		setTimeout(async () => {
			footprints.fadeoutStartTime = performance.now() / 1000.0;
			await wait(fadeout.duration * 1000.0);
			footprints.isDestroyed = true;
		}, fadeout.start * 1000.0);
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


	drawTreeAdvanced(layers, x, y, angle, viewCenter) {
		const { images } = this.assets;
		const ctx = this.context2d;

		const t = performance.now() / 1000.0;

		const center = {
			x: images.tree01_01.width / 2,
			y: images.tree01_01.height / 2,
		};

		const parallax = {
			x: config.parallax.strength * (x - viewCenter.x),
			y: config.parallax.strength * (y - viewCenter.y),
		};

		const wind = {
			direction: { angle: 30 },
			strength: 10.0,
		};

		const anim01 = t => {
			const period = 3.0;
			const nt = t / period;
			const tt = nt - Math.floor(nt);
			const u = Math.tan(Math.PI / 2 * tt);
			const v = 2 * u * u;
			return v * v / (v * v * v + 0.1);
		}
		const interpSin = (outA, outB, inA, inB, t) => {
			const inFac = (t - inA) / (inB - inA);
			const outFac = 0.5 - 0.5 * Math.cos(Math.PI * inFac);
			return outA + (outB - outA) * outFac;
		}
		const interpSin2 = (outA, outB, inA, inB, t) => {
			const inFac = (t - inA) / (inB - inA);
			const outFac = 0.5 - 0.5 * Math.cos(Math.PI * inFac);
			return outA + (outB - outA) * outFac * outFac;
		}
		const interpPow = (outA, outB, inA, inB, t, n) => {
			const inFac = (t - inA) / (inB - inA);
			const outFac = 0.5 - 0.5 * Math.cos(Math.PI * inFac);
			return outA + (outB - outA) * Math.pow(outFac, n);
		}
		const anim02 = t => {
			const period = 4.0;
			const nt = t / period;
			const tt = nt - Math.floor(nt);
			if (tt < 0.2) {
				return interpSin(0.0, 1.05, 0.0, 0.2, tt);
			} else if (tt < 0.25) {
				return interpSin(1.05, 1.0, 0.2, 0.25, tt);
			} else {
				return interpSin(1.0, 0.0, 0.25, 1.0, tt);
			}
		}
		const anim03 = t => {
			const period = 2.0;
			const nt = t / period;
			const u = Math.PI * nt;
			return Math.cos(u + 0.6 * Math.abs(Math.sin(u)));
		}
		const anim04 = t => {
			return 2.0 * (anim03(t) - 0.8 * anim03(t - 0.25));
		}

		const windDirection = {
			x: Math.cos(wind.direction.angle * Math.PI / 180.0),
			y: Math.sin(wind.direction.angle * Math.PI / 180.0),
		};

		const drawLayer = (image, parallaxSensibility, windSensibility, windDelay) => {
			const magnitude = windSensibility * wind.strength * anim04(t - windDelay);
			const dx = magnitude * windDirection.x + parallaxSensibility * parallax.x;
			const dy = magnitude * windDirection.y + parallaxSensibility * parallax.y;

			ctx.save();
			ctx.translate(x + dx, y + dy);
			ctx.rotate(angle * Math.PI / 180);
			ctx.drawImage(image, -center.x, -center.y);
			ctx.restore();
		}

		const baseDelay = (windDirection.x * x + windDirection.y * y) / 1000.0;
		for (const layer of layers) {
			drawLayer(images[layer.skin], layer.parallaxSensibility, layer.windSensibility, baseDelay + layer.windDelay);
		}
	}

	drawTree(type, x, y, angle, viewCenter) {
		const layers = [
			{ skin: `tree${type}_03`, parallaxSensibility: 0.5, windSensibility: 0.0, windDelay: 0.0 },
			{ skin: `tree${type}_02`, parallaxSensibility: 1.0, windSensibility: 0.5, windDelay: 0.0 },
			{ skin: `tree${type}_01`, parallaxSensibility: 1.5, windSensibility: 1.0, windDelay: 0.2 },
		];
		this.drawTreeAdvanced(layers, x, y, angle, viewCenter);
	}

	drawBigTree(type, x, y, angle, viewCenter) {
		const layers = [
			{ skin: `tree${type}_04`, parallaxSensibility: 0.5, windSensibility: 0.0, windDelay: 0.0 },
			{ skin: `tree${type}_03`, parallaxSensibility: 1.0, windSensibility: 0.5, windDelay: 0.0 },
			{ skin: `tree${type}_02`, parallaxSensibility: 1.5, windSensibility: 1.0, windDelay: 0.2 },
			{ skin: `tree${type}_01`, parallaxSensibility: 2.0, windSensibility: 1.5, windDelay: 0.4 },
		];
		this.drawTreeAdvanced(layers, x, y, angle, viewCenter);
	}

	draw() {
		const { state } = this;
		const { scene, camera, target, character } = state;
		const { images, bboxes } = this.assets;
		const ctx = this.context2d;

		ctx.fillStyle = "rgb(0, 0, 0)";
		ctx.fillRect(0, 0, config.width, config.height);

		switch (scene) {

		case 'MENU':
			break;

		case 'GAME':
			const t = performance.now() / 1000.0;
			ctx.save();
			ctx.translate(camera.smoothPosition.x, camera.smoothPosition.y);

			for (const fx of state.fx) {
				const opacity = fx.getOpacity(t);
				lib.drawSprite(ctx, fx.skin, fx.position.x, fx.position.y, fx.angle, opacity);
			}

			if (target.active) {
				lib.drawSprite(ctx, images.target, target.position.x, target.position.y);
			}

			const speed = character.action == 'walk' ? 3.0 : 1.5;
			const frame = (t * speed) % 1 > 0.5 ? 1 : 2;
			lib.drawSprite(
				ctx,
				images[`character_${character.action}0${frame}`],
				character.position.x,
				character.position.y,
				character.angle + 90,
			);

			const viewCenter = {
				x: -camera.smoothPosition.x + config.width / 2,
				y: -camera.smoothPosition.y + config.height / 2,
			};

			this.drawTree("01", 0, 0, 0, viewCenter);
			this.drawTree("02", 256, 30, 0, viewCenter);
			this.drawTree("01", 460, -10, 45, viewCenter);

			this.drawTree("02", 120, 130, 90, viewCenter);
			this.drawTree("01", 560, 150, 135, viewCenter);

			this.drawTree("01", 50, 290, 270, viewCenter);
			this.drawTree("02", 280, 350, 180, viewCenter);

			this.drawBigTree("02", 900, 250, 0, viewCenter);

			ctx.drawImage(
				images.farm,
				0, 0,
				images.farm.width,
				images.farm.height,
				-500, 0,
				images.farm.width * 2,
				images.farm.height * 2,
			);

			ctx.restore();
			break;

		case 'END':
			break;
		}
	}
}

const app = new App();
