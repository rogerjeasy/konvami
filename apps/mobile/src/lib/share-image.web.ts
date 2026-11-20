import type Svg from 'react-native-svg';

// The picture's width in the saved image (px), as on a phone.
export const SHARE_IMAGE_WIDTH = 1080;

/** The <svg> element react-native-svg drew on the web: inside the box named `containerId`. */
function svgElement(containerId: string): SVGSVGElement | null {
  const found = document.getElementById(containerId)?.querySelector('svg');
  return found instanceof SVGSVGElement ? found : null;
}

/** The picture as a PNG blob, drawn on a canvas at `SHARE_IMAGE_WIDTH`. */
async function pngOf(element: SVGSVGElement): Promise<Blob> {
  const box = element.viewBox.baseVal;
  const height = Math.round((SHARE_IMAGE_WIDTH * box.height) / box.width);
  const markup = new XMLSerializer().serializeToString(element);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.width = SHARE_IMAGE_WIDTH;
    image.height = height;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image_failed'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_IMAGE_WIDTH;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(image, 0, 0, SHARE_IMAGE_WIDTH, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('image_failed'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * On the web: the browser's share sheet where it can share files, a download otherwise. Only
 * when the learner asks. Rejects when the picture cannot be drawn.
 */
export async function shareSvgImage(
  _svg: Svg | null,
  name: string,
  containerId: string,
): Promise<void> {
  const element = svgElement(containerId);
  if (!element) throw new Error('nothing_to_share');
  const blob = await pngOf(element);
  const file = new File([blob], `${name}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
