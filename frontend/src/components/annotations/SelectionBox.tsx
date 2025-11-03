import React from 'react';
import { Rect } from 'react-konva';

interface SelectionBoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SelectionBox: React.FC<SelectionBoxProps> = ({ x, y, width, height }) => {
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="rgba(0, 123, 255, 0.1)"
      stroke="#007bff"
      strokeWidth={1}
      dash={[5, 5]}
    />
  );
};

export default SelectionBox;