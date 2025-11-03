import React from 'react';
import { Group, Circle, Text, Rect } from 'react-konva';

interface CursorTrackerProps {
  userId: string;
  position: { x: number; y: number };
  color: string;
  name: string;
}

const CursorTracker: React.FC<CursorTrackerProps> = ({
  userId,
  position,
  color,
  name,
}) => {
  return (
    <Group x={position.x} y={position.y}>
      {/* Cursor pointer */}
      <Circle
        x={0}
        y={0}
        radius={6}
        fill={color}
        stroke="white"
        strokeWidth={2}
        opacity={0.8}
      />

      {/* User label */}
      <Group x={10} y={-20}>
        <Rect
          x={0}
          y={0}
          width={Math.max(60, name.length * 7 + 10)}
          height={18}
          fill={color}
          cornerRadius={2}
          opacity={0.9}
        />
        <Text
          x={4}
          y={3}
          text={name}
          fontSize={11}
          fill="white"
          fontFamily="system-ui"
        />
      </Group>
    </Group>
  );
};

export default CursorTracker;