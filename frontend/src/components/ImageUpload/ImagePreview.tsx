import React from 'react';

interface ImagePreviewProps {
  src: string;
  alt: string;
  file: File;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ src, alt, file }) => {
  return (
    <div className="image-preview">
      <img src={src} alt={alt} />
      <div className="image-details">
        <p>{file.name}</p>
        <p>Size: {Math.round(file.size / 1024)} KB</p>
        <p>Type: {file.type}</p>
      </div>
    </div>
  );
};
