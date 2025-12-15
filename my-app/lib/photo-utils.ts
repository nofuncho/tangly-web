import * as ImageManipulator from "expo-image-manipulator";

type PhotoLike = {
  uri: string;
  width?: number;
  height?: number;
};

export const optimizePhoto = async <T extends PhotoLike>(photo: T): Promise<T> => {
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ resize: { width: 1080 } }],
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
