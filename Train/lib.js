
const zip = (...rows) => [...rows[0]].map((_,c) => rows.map(row => row[c]));

export function wait(ms) {
	return new Promise(resolve => { setTimeout(resolve, ms); });
}

export const lerp = (a, b, t) => a * (1.0 - t) + b * t;

export function lerpAngles(a, b, t) {
	const da = (b - a) % 360;
    const arc = 2 * da % 360 - da;
	return a + arc * t;
}

export function fetchImage(url) {
	return new Promise(resolve => {
		const img = new Image();
		img.addEventListener("load", e => resolve(img));
		img.src = url;
	});
}

export function replaceColorByAlpha(image, color) {
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

export function bboxOffset(bbox, x, y) {
	return {
		minx: bbox.minx + x,
		miny: bbox.miny + y,
		maxx: bbox.maxx + x,
		maxy: bbox.maxy + y,
	};
}

export function bboxShrink(bbox, m) {
	return {
		minx: bbox.minx + m,
		miny: bbox.miny + m,
		maxx: bbox.maxx - m,
		maxy: bbox.maxy - m,
	};
}

export function bboxFromImage(img, x, y) {
	return {
		minx: x,
		miny: y,
		maxx: x + img.width,
		maxy: y + img.height,
	};
}

export function bboxIntersection(a, b) {
	return {
		minx: Math.max(a.minx, b.minx),
		maxx: Math.min(a.maxx, b.maxx),
		miny: Math.max(a.miny, b.miny),
		maxy: Math.min(a.maxy, b.maxy),
	}
}

export function bboxIsEmpty(bbox) {
	return (
		(bbox.maxx - bbox.minx) <= 0.0 ||
		(bbox.maxy - bbox.miny) <= 0.0
	);
}

// Draw a bbox
export function bboxStroke(ctx, bbox) {
	ctx.strokeRect(
		bbox.minx + 0.5,
		bbox.miny + 0.5,
		bbox.maxx - bbox.minx,
		bbox.maxy - bbox.miny,
	);
}

// BBox of the non-transparent content of the image
export function computeImageContentBBox(canvas) {
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

export function isOpaqueAt(canvas, position) {
	const { x, y } = position;
	if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false;
	return canvas.getContext("2d").getImageData(x, y, 1, 1).data[3] > 0
}

export function setButtonImage(element, image) {
	element.src = image.toDataURL();
	element.style.width = `${image.width * config.domPixelMultiplier}em`;
	element.style.height = `${image.height * config.domPixelMultiplier}em`;	
}

export function setupButton(args) {
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

export function drawSprite(ctx, image, x, y, angle, options) {
	options = {
		opacity: 1.0,
		pivot: {
			x: 0.5,
			y: 0.5,
		},
		...options
	};

	ctx.save();
	if (options.opacity !== undefined) ctx.globalAlpha = options.opacity;
	ctx.translate(x, y);
	ctx.rotate(angle * Math.PI / 180);
	ctx.drawImage(image, -image.width * options.pivot.x, -image.height * options.pivot.y);
	ctx.restore();
}

class PseudoRandomGenerator {
	constructor(seed) {
		this.value = seed;
	}

	mulberry32(a) {
		var t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}

	random() {
		this.value = this.mulberry32(this.value);
		return this.value;
	}
}
