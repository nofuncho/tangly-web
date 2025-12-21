import * as ImageManipulator from "expo-image-manipulator";

type PhotoLike = {
  uri: string;
  width?: number;
  height?: number;
};

export type NormalizedCropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const buildCropAction = (photo: PhotoLike, region: NormalizedCropRegion) => {
  if (!photo.width || !photo.height) {
    return null;
  }

  const normalizedWidth = Math.max(region.width, 0);
  const normalizedHeight = Math.max(region.height, 0);
  let cropWidth = Math.round(normalizedWidth * photo.width);
  let cropHeight = Math.round(normalizedHeight * photo.height);
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  cropWidth = Math.min(cropWidth, photo.width);
  cropHeight = Math.min(cropHeight, photo.height);

  const xRatio = Math.max(region.x, 0);
  const yRatio = Math.max(region.y, 0);
  const maxX = Math.max(photo.width - cropWidth, 0);
  const maxY = Math.max(photo.height - cropHeight, 0);
  const originX = clamp(Math.round(xRatio * photo.width), 0, maxX);
  const originY = clamp(Math.round(yRatio * photo.height), 0, maxY);
  cropWidth = Math.min(cropWidth, photo.width - originX);
  cropHeight = Math.min(cropHeight, photo.height - originY);
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  return {
    originX,
    originY,
    width: cropWidth,
    height: cropHeight,
  };
};

export const optimizePhoto = async <T extends PhotoLike>(
  photo: T,
  options?: { crop?: NormalizedCropRegion }
): Promise<T> => {
  try {
    const actions: ImageManipulator.Action[] = [];
    if (options?.crop) {
      const cropAction = buildCropAction(photo, options.crop);
      if (cropAction) {
        if (__DEV__) {
          console.log("[optimizePhoto] crop action", {
            photo: { width: photo.width, height: photo.height },
            cropAction,
          });
        }
        actions.push({ crop: cropAction });
      } else if (__DEV__) {
        console.warn("[optimizePhoto] invalid crop, skipping", {
          photo: { width: photo.width, height: photo.height },
          crop: options.crop,
        });
      }
    }

    const estimatedWidth =
      options?.crop && photo.width
        ? Math.round(photo.width * options.crop.width)
        : photo.width ?? 0;
    const targetWidth =
      estimatedWidth > 0 ? Math.min(estimatedWidth, 1080) : 1080;
    actions.push({ resize: { width: targetWidth } });

    const manipulated = await ImageManipulator.manipulateAsync(
      photo.uri,
      actions,
      { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG }
    );
    return {
      ...photo,
      uri: manipulated.uri,
      width: manipulated.width,
      height: manipulated.height,
    };
  } catch (error) {
    console.warn("Failed to optimize photo", error);
    return photo;
  }
};
