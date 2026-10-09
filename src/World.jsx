import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, MapControls, Sky, Sparkles, useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const CITY_LIMIT = 14.9;
const NAV_CLEARANCE = 0.18;
const NAV_GRID_STEP = 0.5;

const colors = {
  asphalt: '#505b5b',
  asphaltLight: '#626c6a',
  concrete: '#c7c8bd',
  concreteDark: '#9da69e',
  grass: '#829d87',
  grassLight: '#9fb79a',
  building: '#b5b3a8',
  buildingDark: '#858c88',
  buildingWarm: '#c7b9a5',
  glass: '#769ca0',
  glassDark: '#506e78',
  windowLight: '#f1c982',
  tree: '#648372',
  treeLight: '#83a184',
  trunk: '#7e6c5a',
  accent: '#c18b65',
};

const SAFE_SPOTS = [
  [-10.7, -7.5], [-7.1, -2.2], [-2.5, -8.5], [3.3, -8.2], [8.4, -8.5],
  [10.1, -2.4], [8.8, 4.5], [2.3, 7.2], [-3.9, 7.4], [-10.3, 5.7],
  [-11.3, 1.5], [-4.2, -1.2], [4.8, 1.6], [0.8, 11.2],
];

const TREE_SPOTS = [
  [-12.3, -8.8, 1.1], [-11.2, -5.0, 0.86], [-12.8, 4.1, 1.0], [-10.4, 8.3, 0.94],
  [-5.5, 10.7, 0.96], [1.8, 11.4, 1.12], [8.4, 10.5, 0.9], [12.3, 8.0, 1.1],
  [13.0, 2.3, 0.86], [12.2, -4.5, 1.02], [11.7, -10.0, 0.96], [4.8, -11.5, 1.1],
  [-1.9, -11.6, 0.9], [-7.7, -11.4, 1.06], [5.0, 5.9, 0.75], [-7.0, 5.5, 0.72],
];

// Colisores da cidade. Eles ficam separados da renderização para que a navegação
// continue correta mesmo quando um objeto recebe outra aparência ou escala.
const NAV_OBSTACLES = [
  { type: 'rect', x: -5.4, z: -5.9, width: 5.7, depth: 4.45, label: 'casa' },
  { type: 'rect', x: -9.0, z: -0.15, width: 4.95, depth: 4.55, label: 'predio' },
  { type: 'rect', x: 7.8, z: 4.5, width: 5.55, depth: 4.45, label: 'predio' },
  { type: 'rect', x: -7.9, z: 5.6, width: 5.65, depth: 4.05, label: 'predio' },
  { type: 'rect', x: 7.7, z: 9.3, width: 4.35, depth: 3.75, label: 'predio' },
  { type: 'rect', x: -7.2, z: 10.1, width: 4.65, depth: 3.35, label: 'predio' },
  { type: 'rect', x: 10.9, z: -9.5, width: 4.55, depth: 3.85, label: 'predio' },
  { type: 'rect', x: -0.92, z: -1.05, width: 2.25, depth: 1.2, label: 'carro' },
  { type: 'rect', x: 0.92, z: 1.18, width: 2.25, depth: 1.2, label: 'carro' },
  { type: 'circle', x: 4.65, z: -7.75, radius: 0.72, label: 'arvore' },
  { type: 'circle', x: 9.65, z: -7.5, radius: 0.78, label: 'arvore' },
  { type: 'circle', x: 9.25, z: -4.35, radius: 0.64, label: 'arvore' },
  { type: 'circle', x: -2.5, z: -3.3, radius: 0.16, label: 'poste' },
  { type: 'circle', x: 2.6, z: -3.3, radius: 0.16, label: 'poste' },
  { type: 'circle', x: -2.6, z: 3.3, radius: 0.16, label: 'poste' },
  { type: 'circle', x: 2.6, z: 3.3, radius: 0.16, label: 'poste' },
  { type: 'circle', x: 12.2, z: -3.9, radius: 0.16, label: 'poste' },
  ...TREE_SPOTS.map(([x, z, scale]) => ({ type: 'circle', x, z, radius: 0.42 * scale, label: 'arvore' })),
];

function groundHeight(x, z) {
  return 0.05 + Math.sin(x * 0.35 + z * 0.2) * 0.018 + Math.cos(z * 0.31) * 0.012;
}

function isBlocked(x, z, radius = 0.28) {
  const paddedRadius = radius + NAV_CLEARANCE;
  if (Math.abs(x) > CITY_LIMIT - paddedRadius || Math.abs(z) > CITY_LIMIT - paddedRadius) return true;
  return NAV_OBSTACLES.some((obstacle) => {
    if (obstacle.type === 'circle') {
      return Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + paddedRadius;
    }
    const halfWidth = obstacle.width / 2 + paddedRadius;
    const halfDepth = obstacle.depth / 2 + paddedRadius;
    return Math.abs(x - obstacle.x) < halfWidth && Math.abs(z - obstacle.z) < halfDepth;
  });
}

function lineIsBlocked(fromX, fromZ, toX, toZ, radius = 0.28) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.max(4, Math.ceil(distance / 0.22));
  for (let index = 1; index <= steps; index += 1) {
    const amount = index / steps;
    const x = THREE.MathUtils.lerp(fromX, toX, amount);
    const z = THREE.MathUtils.lerp(fromZ, toZ, amount);
    if (isBlocked(x, z, radius)) return true;
  }
  return false;
}

function nearestWalkablePoint(x, z, radius = 0.28) {
  if (!isBlocked(x, z, radius)) return { x, z };
  for (let distance = 0.45; distance <= 4.3; distance += 0.28) {
    for (let slice = 0; slice < 20; slice += 1) {
      const angle = (slice / 20) * Math.PI * 2;
      const candidateX = x + Math.cos(angle) * distance;
      const candidateZ = z + Math.sin(angle) * distance;
      if (!isBlocked(candidateX, candidateZ, radius)) return safeDestination(candidateX, candidateZ, radius);
    }
  }
  return { x: 0, z: 0 };
}

function findGridPath(fromX, fromZ, toX, toZ, radius = 0.28) {
  const maxIndex = Math.floor((CITY_LIMIT * 2 - NAV_GRID_STEP * 2) / NAV_GRID_STEP);
  const toCell = (value) => THREE.MathUtils.clamp(Math.round((value + CITY_LIMIT - NAV_GRID_STEP) / NAV_GRID_STEP), 0, maxIndex);
  const toPoint = (x, z) => ({
    x: -CITY_LIMIT + NAV_GRID_STEP + x * NAV_GRID_STEP,
    z: -CITY_LIMIT + NAV_GRID_STEP + z * NAV_GRID_STEP,
  });
  const key = (x, z) => `${x}:${z}`;
  const startPoint = nearestWalkablePoint(fromX, fromZ, radius);
  const goalPoint = nearestWalkablePoint(toX, toZ, radius);
  const start = { x: toCell(startPoint.x), z: toCell(startPoint.z) };
  const goal = { x: toCell(goalPoint.x), z: toCell(goalPoint.z) };
  const walkable = (x, z) => {
    if (x < 0 || z < 0 || x > maxIndex || z > maxIndex) return false;
    const point = toPoint(x, z);
    return !isBlocked(point.x, point.z, radius);
  };
  const findNearestCell = (cell) => {
    if (walkable(cell.x, cell.z)) return cell;
    for (let distance = 1; distance < 10; distance += 1) {
      for (let x = cell.x - distance; x <= cell.x + distance; x += 1) {
        for (let z = cell.z - distance; z <= cell.z + distance; z += 1) {
          if (Math.abs(x - cell.x) !== distance && Math.abs(z - cell.z) !== distance) continue;
          if (walkable(x, z)) return { x, z };
        }
      }
    }
    return null;
  };
  const safeStart = findNearestCell(start);
  const safeGoal = findNearestCell(goal);
  if (!safeStart || !safeGoal) return null;

  const open = [{ x: safeStart.x, z: safeStart.z, f: 0 }];
  const openKeys = new Set([key(safeStart.x, safeStart.z)]);
  const cameFrom = new Map();
  const costs = new Map([[key(safeStart.x, safeStart.z), 0]]);
  const neighbors = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414],
  ];
  let iterations = 0;
  const heuristic = (x, z) => Math.hypot(safeGoal.x - x, safeGoal.z - z);

  while (open.length > 0 && iterations < 2600) {
    iterations += 1;
    open.sort((first, second) => first.f - second.f);
    const current = open.shift();
    const currentKey = key(current.x, current.z);
    openKeys.delete(currentKey);
    if (current.x === safeGoal.x && current.z === safeGoal.z) {
      const cells = [{ x: current.x, z: current.z }];
      let traceKey = currentKey;
      while (cameFrom.has(traceKey)) {
        const previous = cameFrom.get(traceKey);
        cells.unshift(previous);
        traceKey = key(previous.x, previous.z);
      }
      const points = cells.map((cell) => toPoint(cell.x, cell.z));
      const simplified = [points[0]];
      let anchor = 0;
      for (let index = 2; index < points.length; index += 1) {
        if (lineIsBlocked(points[anchor].x, points[anchor].z, points[index].x, points[index].z, radius)) {
          simplified.push(points[index - 1]);
          anchor = index - 1;
        }
      }
      if (points.length > 1) simplified.push(points[points.length - 1]);
      return simplified;
    }

    neighbors.forEach(([offsetX, offsetZ, travel]) => {
      const nextX = current.x + offsetX;
      const nextZ = current.z + offsetZ;
      if (!walkable(nextX, nextZ)) return;
      if (offsetX && offsetZ && (!walkable(current.x + offsetX, current.z) || !walkable(current.x, current.z + offsetZ))) return;
      const currentPoint = toPoint(current.x, current.z);
      const nextPoint = toPoint(nextX, nextZ);
      if (lineIsBlocked(currentPoint.x, currentPoint.z, nextPoint.x, nextPoint.z, radius)) return;
      const nextKey = key(nextX, nextZ);
      const nextCost = (costs.get(currentKey) ?? Infinity) + travel;
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) return;
      cameFrom.set(nextKey, { x: current.x, z: current.z });
      costs.set(nextKey, nextCost);
      if (!openKeys.has(nextKey)) {
        open.push({ x: nextX, z: nextZ, f: nextCost + heuristic(nextX, nextZ) });
        openKeys.add(nextKey);
      }
    });
  }
  return null;
}

function findDetourPoint(fromX, fromZ, toX, toZ, radius = 0.28) {
  const path = findGridPath(fromX, fromZ, toX, toZ, radius);
  if (!path || path.length < 2) return null;
  return path[1];
}

function safeDestination(x, z, radius = 0.28) {
  const length = Math.hypot(x, z);
  if (length > CITY_LIMIT) {
    const angle = Math.atan2(z, x);
    return nearestWalkablePoint(Math.cos(angle) * (CITY_LIMIT - 0.4), Math.sin(angle) * (CITY_LIMIT - 0.4), radius);
  }
  const clamped = {
    x: THREE.MathUtils.clamp(x, -CITY_LIMIT, CITY_LIMIT),
    z: THREE.MathUtils.clamp(z, -CITY_LIMIT, CITY_LIMIT),
  };
  return nearestWalkablePoint(clamped.x, clamped.z, radius);
}

function Window({ position, size = [0.54, 0.62, 0.035], warm = false }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={warm ? colors.windowLight : colors.glass}
        emissive={warm ? '#b67642' : '#2e535d'}
        emissiveIntensity={warm ? 0.42 : 0.16}
        roughness={0.28}
        metalness={0.08}
      />
    </mesh>
  );
}

function StreetTree({ x, z, scale = 1, onSelect }) {
  return (
    <group
      position={[x, groundHeight(x, z), z]}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(x, z, 'tree');
      }}
    >
      <mesh castShadow position={[0, 0.76, 0]}>
        <cylinderGeometry args={[0.13, 0.22, 1.52, 10]} />
        <meshStandardMaterial color={colors.trunk} roughness={0.92} />
      </mesh>
      <mesh castShadow position={[0, 1.58, 0]} scale={[1.02, 1.18, 0.96]}>
        <dodecahedronGeometry args={[0.74, 2]} />
        <meshStandardMaterial color={colors.tree} roughness={0.96} />
      </mesh>
      <mesh castShadow position={[0.42, 1.7, 0.16]} scale={[0.62, 0.72, 0.58]}>
        <dodecahedronGeometry args={[0.54, 1]} />
        <meshStandardMaterial color={colors.treeLight} roughness={0.96} />
      </mesh>
      <mesh castShadow position={[-0.34, 1.34, 0.06]} scale={[0.58, 0.62, 0.54]}>
        <dodecahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial color="#718f78" roughness={0.96} />
      </mesh>
    </group>
  );
}

function LowBuilding({ x, z, width, depth, height, color, warm = false, onSelect, variant = 0 }) {
  const columns = Math.max(2, Math.floor(width / 1.2));
  const rows = Math.max(1, Math.floor(height / 1.25));
  const windows = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const px = -width / 2 + 0.68 + column * ((width - 1.1) / Math.max(columns - 1, 1));
      const py = 0.88 + row * 1.02;
      windows.push(<Window key={`front-${row}-${column}`} position={[px, py, depth / 2 + 0.028]} warm={warm && (row + column + variant) % 3 === 0} />);
      if (variant % 2 === 1) windows.push(<Window key={`back-${row}-${column}`} position={[-px, py, -depth / 2 - 0.028]} warm={false} />);
    }
  }

  return (
    <group
      position={[x, groundHeight(x, z), z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(x, z, 'building');
      }}
    >
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.86} />
      </mesh>
      <mesh castShadow position={[0, height + 0.08, 0]}>
        <boxGeometry args={[width + 0.16, 0.18, depth + 0.16]} />
        <meshStandardMaterial color={variant % 2 ? '#737d7a' : '#8f958e'} roughness={0.82} />
      </mesh>
      {windows}
      <mesh position={[0, 0.52, depth / 2 + 0.04]}>
        <boxGeometry args={[0.72, 0.95, 0.055]} />
        <meshStandardMaterial color={variant % 2 ? '#46555a' : '#6d7774'} roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.08, depth / 2 + 0.12]}>
        <boxGeometry args={[width + 0.35, 0.16, 0.36]} />
        <meshStandardMaterial color={colors.concreteDark} roughness={0.95} />
      </mesh>
    </group>
  );
}

function NavHouse({ onSelect }) {
  const x = -5.4;
  const z = -5.9;
  return (
    <group position={[x, groundHeight(x, z), z]} onClick={(event) => { event.stopPropagation(); onSelect(x, z, 'home'); }}>
      <mesh castShadow receiveShadow position={[0, 1.16, 0]}>
        <boxGeometry args={[5.2, 2.3, 3.9]} />
        <meshStandardMaterial color="#c9c4b7" roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0, 2.43, 0]}>
        <boxGeometry args={[5.45, 0.28, 4.15]} />
        <meshStandardMaterial color="#4f6262" roughness={0.7} metalness={0.08} />
      </mesh>
      <mesh position={[0.06, 1.35, 2.0]}>
        <boxGeometry args={[2.05, 1.28, 0.06]} />
        <meshStandardMaterial color="#557981" emissive="#24424a" emissiveIntensity={0.14} roughness={0.2} metalness={0.15} />
      </mesh>
      <mesh position={[-1.55, 1.26, 2.02]}>
        <boxGeometry args={[0.72, 1.32, 0.08]} />
        <meshStandardMaterial color="#52696d" roughness={0.62} />
      </mesh>
      <Window position={[1.72, 1.48, 2.02]} size={[0.72, 0.66, 0.07]} warm />
      <mesh position={[-1.55, 0.6, 2.04]}>
        <boxGeometry args={[0.88, 0.12, 0.18]} />
        <meshStandardMaterial color="#a27e5f" roughness={0.9} />
      </mesh>
      <mesh position={[1.72, 0.09, 2.05]}>
        <boxGeometry args={[0.92, 0.18, 0.5]} />
        <meshStandardMaterial color="#707b73" roughness={0.86} />
      </mesh>
      <mesh position={[-0.45, 0.1, 2.48]} receiveShadow>
        <boxGeometry args={[1.25, 0.08, 1.0]} />
        <meshStandardMaterial color="#cdbb9e" roughness={1} />
      </mesh>
      <mesh position={[0.98, 0.07, 2.48]} receiveShadow>
        <boxGeometry args={[0.9, 0.08, 1.0]} />
        <meshStandardMaterial color="#cdbb9e" roughness={1} />
      </mesh>
      <mesh position={[-2.17, 0.42, 1.68]}>
        <boxGeometry args={[0.25, 0.55, 0.25]} />
        <meshStandardMaterial color="#66826e" roughness={0.95} />
      </mesh>
      <mesh position={[-2.17, 0.78, 1.68]} scale={[0.54, 0.46, 0.54]}>
        <dodecahedronGeometry args={[0.48, 1]} />
        <meshStandardMaterial color="#6f9476" roughness={0.96} />
      </mesh>
      <mesh position={[2.34, 0.18, 1.4]}>
        <cylinderGeometry args={[0.1, 0.1, 0.35, 8]} />
        <meshStandardMaterial color="#775e4e" roughness={0.92} />
      </mesh>
      <mesh position={[2.34, 0.43, 1.4]} scale={[0.46, 0.34, 0.46]}>
        <dodecahedronGeometry args={[0.44, 1]} />
        <meshStandardMaterial color="#78957c" roughness={0.96} />
      </mesh>
    </group>
  );
}

function Park({ onSelect }) {
  const x = 7.1;
  const z = -6.1;
  return (
    <group position={[x, groundHeight(x, z), z]} onClick={(event) => { event.stopPropagation(); onSelect(x, z, 'park'); }}>
      <mesh receiveShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[7.0, 0.12, 5.8]} />
        <meshStandardMaterial color={colors.grass} roughness={1} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[5.8, 0.04, 0.5]} />
        <meshStandardMaterial color="#c8b89a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[4.7, 0.04, 0.5]} />
        <meshStandardMaterial color="#c8b89a" roughness={1} />
      </mesh>
      <StreetTree x={-2.45} z={-1.65} scale={0.82} onSelect={onSelect} />
      <StreetTree x={2.55} z={-1.4} scale={0.88} onSelect={onSelect} />
      <StreetTree x={2.15} z={1.75} scale={0.72} onSelect={onSelect} />
      <mesh position={[-0.5, 0.42, 1.62]} rotation={[0, 0, 0.02]}>
        <boxGeometry args={[1.25, 0.12, 0.34]} />
        <meshStandardMaterial color="#5b6968" roughness={0.65} />
      </mesh>
      <mesh position={[-1.03, 0.67, 1.62]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[1.25, 0.1, 0.18]} />
        <meshStandardMaterial color="#5b6968" roughness={0.65} />
      </mesh>
      <mesh position={[0.8, 0.1, -0.85]}>
        <cylinderGeometry args={[0.85, 0.85, 0.18, 32]} />
        <meshStandardMaterial color="#a8b0aa" roughness={0.92} />
      </mesh>
      <mesh position={[0.8, 0.24, -0.85]}>
        <cylinderGeometry args={[0.62, 0.62, 0.07, 32]} />
        <meshStandardMaterial color="#80a9a2" roughness={0.2} metalness={0.06} />
      </mesh>
      <mesh position={[0.8, 0.72, -0.85]}>
        <cylinderGeometry args={[0.06, 0.08, 0.85, 8]} />
        <meshStandardMaterial color="#b6c1b5" roughness={0.78} />
      </mesh>
    </group>
  );
}

function StreetLamp({ x, z }) {
  return (
    <group position={[x, groundHeight(x, z), z]}>
      <mesh castShadow position={[0, 1.34, 0]}>
        <cylinderGeometry args={[0.055, 0.08, 2.7, 8]} />
        <meshStandardMaterial color="#515e5d" roughness={0.56} metalness={0.3} />
      </mesh>
      <mesh position={[0.21, 2.7, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.45, 8]} />
        <meshStandardMaterial color="#515e5d" roughness={0.56} metalness={0.3} />
      </mesh>
      <mesh position={[0.41, 2.68, 0]}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshStandardMaterial color="#f0d18c" emissive="#c9894b" emissiveIntensity={0.72} roughness={0.28} />
      </mesh>
      <pointLight position={[0.41, 2.63, 0]} distance={4.2} intensity={0.22} color="#ffd59d" />
    </group>
  );
}

function ParkedCar({ x, z, rotation = 0, color = '#788d8b' }) {
  return (
    <group position={[x, 0.16, z]} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.95, 0.36, 0.92]} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.12} />
      </mesh>
      <mesh position={[-0.15, 0.3, 0]}>
        <boxGeometry args={[0.9, 0.33, 0.8]} />
        <meshStandardMaterial color="#4c6d76" roughness={0.18} metalness={0.12} />
      </mesh>
      {[-0.62, 0.62].map((wheel) => (
        <mesh key={wheel} position={[wheel, -0.12, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.1, 12]} />
          <meshStandardMaterial color="#273335" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function CityWorld({ onSelect }) {
  return (
    <group>
      <mesh position={[0, -0.46, 0]} receiveShadow>
        <boxGeometry args={[32.4, 0.9, 30.8]} />
        <meshStandardMaterial color="#697574" roughness={1} />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow onClick={(event) => { event.stopPropagation(); onSelect(event.point.x, event.point.z, 'street'); }}>
        <boxGeometry args={[31.5, 0.08, 29.9]} />
        <meshStandardMaterial color="#a7b09f" roughness={1} />
      </mesh>

      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[31.5, 0.08, 5.5]} />
        <meshStandardMaterial color={colors.asphalt} roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.081, 0]} receiveShadow>
        <boxGeometry args={[5.5, 0.082, 29.9]} />
        <meshStandardMaterial color={colors.asphalt} roughness={0.94} />
      </mesh>

      {[-3.22, 3.22].map((z) => (
        <mesh key={`sidewalk-z-${z}`} position={[0, 0.16, z]} receiveShadow>
          <boxGeometry args={[31.5, 0.12, 0.48]} />
          <meshStandardMaterial color={colors.concrete} roughness={0.98} />
        </mesh>
      ))}
      {[-3.22, 3.22].map((x) => (
        <mesh key={`sidewalk-x-${x}`} position={[x, 0.16, 0]} receiveShadow>
          <boxGeometry args={[0.48, 0.12, 29.9]} />
          <meshStandardMaterial color={colors.concrete} roughness={0.98} />
        </mesh>
      ))}

      {[-8, -4, 4, 8].map((x) => (
        <mesh key={`dash-x-${x}`} position={[x, 0.14, 0]}>
          <boxGeometry args={[1.9, 0.018, 0.08]} />
          <meshStandardMaterial color="#c8c4a9" roughness={0.8} />
        </mesh>
      ))}
      {[-8, -4, 4, 8].map((z) => (
        <mesh key={`dash-z-${z}`} position={[0, 0.14, z]}>
          <boxGeometry args={[0.08, 0.018, 1.9]} />
          <meshStandardMaterial color="#c8c4a9" roughness={0.8} />
        </mesh>
      ))}

      <NavHouse onSelect={onSelect} />
      <Park onSelect={onSelect} />
      <LowBuilding x={-9.0} z={-0.15} width={4.6} depth={4.2} height={3.8} color={colors.buildingWarm} warm onSelect={onSelect} variant={1} />
      <LowBuilding x={7.8} z={4.5} width={5.2} depth={4.1} height={4.7} color={colors.buildingDark} onSelect={onSelect} variant={2} />
      <LowBuilding x={-7.9} z={5.6} width={5.3} depth={3.7} height={3.15} color="#9fa9a4" onSelect={onSelect} variant={0} />
      <LowBuilding x={7.7} z={9.3} width={4.0} depth={3.4} height={3.0} color="#b2a998" warm onSelect={onSelect} variant={1} />
      <LowBuilding x={-7.2} z={10.1} width={4.3} depth={3.0} height={2.65} color="#a7aaa2" onSelect={onSelect} variant={3} />
      <LowBuilding x={10.9} z={-9.5} width={4.2} depth={3.5} height={3.0} color="#a8b2ad" onSelect={onSelect} variant={2} />

      {TREE_SPOTS.map(([x, z, scale], index) => <StreetTree key={`tree-${index}`} x={x} z={z} scale={scale} onSelect={onSelect} />)}
      <StreetLamp x={-2.5} z={-3.3} />
      <StreetLamp x={2.6} z={-3.3} />
      <StreetLamp x={-2.6} z={3.3} />
      <StreetLamp x={2.6} z={3.3} />
      <StreetLamp x={12.2} z={-3.9} />
      <ParkedCar x={-0.92} z={-1.05} rotation={Math.PI / 2} color="#7d9893" />
      <ParkedCar x={0.92} z={1.18} rotation={-Math.PI / 2} color="#a68170" />
      <Sparkles count={28} scale={[27, 2.2, 27]} position={[0, 2.5, 0]} size={1.1} speed={0.12} noise={1.6} color="#ffe7b7" />
    </group>
  );
}

function InteractionMarker({ destination }) {
  const ring = useRef();
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const pulse = (Math.sin(clock.elapsedTime * 4.4) + 1) * 0.5;
    ring.current.scale.setScalar(0.86 + pulse * 0.16);
    ring.current.material.opacity = 0.2 + (1 - pulse) * 0.2;
  });
  if (!destination) return null;
  return (
    <group position={[destination.x, groundHeight(destination.x, destination.z) + 0.14, destination.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.024, 6, 26]} />
        <meshBasicMaterial color="#f2c982" transparent opacity={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, 0.065, 18]} />
        <meshBasicMaterial color="#fff0c9" transparent opacity={0.46} />
      </mesh>
    </group>
  );
}

function makeFinGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.38);
  shape.bezierCurveTo(-0.25, -0.1, -0.24, 0.27, 0, 0.48);
  shape.bezierCurveTo(0.24, 0.27, 0.25, -0.1, 0, -0.38);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 8 });
  geometry.center();
  return geometry;
}

function makeTailGeometry() {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.04, -0.02, -0.27),
      new THREE.Vector3(-0.16, 0.08, -0.47),
      new THREE.Vector3(-0.3, 0.27, -0.36),
    ]),
    24,
    0.075,
    10,
    false,
  );
}

function makeStarGeometry() {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * (Math.PI / 5);
    const radius = index % 2 === 0 ? 0.32 : 0.13;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.018, bevelThickness: 0.02 });
  geometry.center();
  return geometry;
}

function makeScarfGeometry() {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0, 0.22),
      new THREE.Vector3(0.03, -0.17, 0.31),
      new THREE.Vector3(0.17, -0.34, 0.3),
      new THREE.Vector3(0.29, -0.5, 0.2),
    ]),
    24,
    0.065,
    10,
    false,
  );
}

function setActorGoal(actor, x, z) {
  const target = safeDestination(x, z, actor.radius);
  actor.finalX = target.x;
  actor.finalZ = target.z;
  actor.targetX = target.x;
  actor.targetZ = target.z;
  actor.waypoint = false;
  actor.repathAt = 0;
}

function tryMove(actor, deltaX, deltaZ) {
  const nextX = actor.x + deltaX;
  const nextZ = actor.z + deltaZ;
  if (!isBlocked(nextX, nextZ, actor.radius)) {
    actor.x = nextX;
    actor.z = nextZ;
    return true;
  }
  if (!isBlocked(nextX, actor.z, actor.radius)) {
    actor.x = nextX;
    return true;
  }
  if (!isBlocked(actor.x, nextZ, actor.radius)) {
    actor.z = nextZ;
    return true;
  }
  return false;
}

function Naverio({ destination }) {
  const root = useRef();
  const body = useRef();
  const head = useRef();
  const face = useRef();
  const tail = useRef();
  const scarf = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftFin = useRef();
  const rightFin = useRef();
  const leftEye = useRef();
  const rightEye = useRef();
  const leftPupil = useRef();
  const rightPupil = useRef();
  const mouth = useRef();
  const smile = useRef();
  const bodyGeometry = useMemo(() => new THREE.CapsuleGeometry(0.38, 0.62, 8, 22), []);
  const headGeometry = useMemo(() => new THREE.SphereGeometry(0.55, 28, 20), []);
  const limbGeometry = useMemo(() => new THREE.CapsuleGeometry(0.11, 0.3, 6, 14), []);
  const finGeometry = useMemo(() => makeFinGeometry(), []);
  const tailGeometry = useMemo(() => makeTailGeometry(), []);
  const scarfGeometry = useMemo(() => makeScarfGeometry(), []);
  const starGeometry = useMemo(() => makeStarGeometry(), []);
  const smileGeometry = useMemo(() => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.11, -0.16, 0.55),
      new THREE.Vector3(-0.055, -0.2, 0.57),
      new THREE.Vector3(0, -0.205, 0.58),
      new THREE.Vector3(0.055, -0.2, 0.57),
      new THREE.Vector3(0.11, -0.16, 0.55),
    ]),
    14,
    0.016,
    8,
    false,
  ), []);
  const state = useRef({
    x: -1.45,
    z: -2.15,
    targetX: -1.45,
    targetZ: -2.15,
    finalX: -1.45,
    finalZ: -2.15,
    waypoint: false,
    repathAt: 0,
    radius: 0.3,
    mode: 'rest',
    modeUntil: 3.8,
    lastDestination: 0,
    heading: 0,
    nextBlink: 2.6,
    blinkUntil: 0,
    nextExpression: 5.5,
    smileUntil: 0,
    speakUntil: 0,
    stuckTime: 0,
    seed: Math.random() * 10,
  });

  useEffect(() => () => {
    bodyGeometry.dispose();
    headGeometry.dispose();
    limbGeometry.dispose();
    finGeometry.dispose();
    tailGeometry.dispose();
    scarfGeometry.dispose();
    starGeometry.dispose();
    smileGeometry.dispose();
  }, [bodyGeometry, headGeometry, limbGeometry, finGeometry, tailGeometry, scarfGeometry, starGeometry, smileGeometry]);

  useFrame(({ clock }, delta) => {
    if (!root.current) return;
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 0.06);
    const actor = state.current;

    if (destination && destination.id !== actor.lastDestination) {
      actor.lastDestination = destination.id;
      setActorGoal(actor, destination.x, destination.z);
      actor.mode = 'walk';
      actor.modeUntil = time + 18;
    }

    if (time > actor.nextBlink && actor.blinkUntil < time) {
      actor.blinkUntil = time + 0.16;
      actor.nextBlink = time + 2.6 + Math.random() * 4.5;
    }

    if (time > actor.nextExpression) {
      if (Math.random() < 0.72) {
        actor.smileUntil = time + 2.2 + Math.random() * 2.8;
        actor.speakUntil = time + 0.5 + Math.random() * 1.8;
      }
      actor.nextExpression = time + 7 + Math.random() * 8;
    }

    if (time > actor.modeUntil) {
      const roll = Math.random();
      if (roll < 0.52) {
        const [x, z] = SAFE_SPOTS[Math.floor(Math.random() * SAFE_SPOTS.length)];
        setActorGoal(actor, x + (Math.random() - 0.5) * 1.4, z + (Math.random() - 0.5) * 1.4);
        actor.mode = roll < 0.12 ? 'run' : 'walk';
        actor.modeUntil = time + 15 + Math.random() * 11;
      } else if (roll < 0.73) {
        actor.mode = 'observe';
        actor.heading += (Math.random() - 0.5) * 1.6;
        actor.modeUntil = time + 2.4 + Math.random() * 3.2;
      } else if (roll < 0.87) {
        actor.mode = 'play';
        actor.modeUntil = time + 3.5 + Math.random() * 2.6;
      } else {
        actor.mode = 'rest';
        actor.modeUntil = time + 3.2 + Math.random() * 4.4;
      }
    }

    if (!actor.waypoint && time >= actor.repathAt && lineIsBlocked(actor.x, actor.z, actor.finalX, actor.finalZ, actor.radius)) {
      const detour = findDetourPoint(actor.x, actor.z, actor.finalX, actor.finalZ, actor.radius);
      if (detour) {
        actor.targetX = detour.x;
        actor.targetZ = detour.z;
        actor.waypoint = true;
      }
      actor.repathAt = time + 0.65;
    }

    const dx = actor.targetX - actor.x;
    const dz = actor.targetZ - actor.z;
    const distance = Math.hypot(dx, dz);
    const movingToTarget = (actor.mode === 'walk' || actor.mode === 'run') && distance > 0.14;
    if (movingToTarget) {
      const speed = actor.mode === 'run' ? 1.06 : 0.48;
      const step = Math.min(distance, speed * dt);
      const moved = tryMove(actor, (dx / distance) * step, (dz / distance) * step);
      if (!moved) {
        actor.stuckTime += dt;
        const detour = findDetourPoint(actor.x, actor.z, actor.finalX, actor.finalZ, actor.radius);
        if (detour) {
          actor.targetX = detour.x;
          actor.targetZ = detour.z;
          actor.waypoint = true;
          actor.repathAt = time + 0.65;
        } else {
          actor.mode = 'observe';
          actor.modeUntil = time + 1.6;
        }
        if (actor.stuckTime > 0.9) {
          const [escapeX, escapeZ] = SAFE_SPOTS[(Math.floor(time * 3) + Math.floor(actor.seed)) % SAFE_SPOTS.length];
          setActorGoal(actor, escapeX, escapeZ);
          actor.mode = 'walk';
          actor.modeUntil = time + 12;
          actor.stuckTime = 0;
        }
      } else {
        actor.stuckTime = 0;
      }
      actor.heading = THREE.MathUtils.lerp(actor.heading, Math.atan2(dx, dz), 0.12);
    } else if (actor.mode === 'walk' || actor.mode === 'run') {
      if (actor.waypoint) {
        actor.waypoint = false;
        actor.targetX = actor.finalX;
        actor.targetZ = actor.finalZ;
        actor.repathAt = time + 0.05;
      } else {
        actor.mode = 'observe';
        actor.modeUntil = time + 2.2 + Math.random() * 2.8;
      }
    } else if (actor.mode === 'play') {
      const orbit = time * 1.55 + actor.seed;
      tryMove(actor, Math.cos(orbit) * dt * 0.22, Math.sin(orbit * 1.13) * dt * 0.2);
      actor.heading = Math.atan2(Math.cos(orbit * 1.13), Math.cos(orbit));
    }

    const safe = safeDestination(actor.x, actor.z, actor.radius);
    actor.x = safe.x;
    actor.z = safe.z;
    const moving = movingToTarget || actor.mode === 'play';
    const cycle = time * (actor.mode === 'run' ? 11 : 8.1) + actor.seed;
    const bob = moving ? Math.abs(Math.sin(cycle)) * 0.045 : Math.sin(time * 1.8 + actor.seed) * 0.012;
    root.current.position.set(actor.x, groundHeight(actor.x, actor.z) + 0.27 + bob, actor.z);
    root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, actor.heading, 0.1);

    if (body.current) {
      body.current.rotation.z = THREE.MathUtils.lerp(body.current.rotation.z, moving ? Math.sin(cycle) * 0.04 : 0, 0.12);
      body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, actor.mode === 'rest' ? 0.07 : moving ? -0.035 : 0, 0.1);
      body.current.scale.y = THREE.MathUtils.lerp(body.current.scale.y, actor.mode === 'rest' ? 0.97 : 1, 0.1);
    }
    const glance = Math.sin(time * (actor.mode === 'observe' ? 0.72 : 0.32) + actor.seed) * (actor.mode === 'observe' ? 0.034 : 0.016);
    const glanceHeight = Math.cos(time * 0.45 + actor.seed) * 0.014;
    if (head.current) {
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, glance * 0.72, 0.08);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, actor.mode === 'observe' ? -0.065 : actor.mode === 'rest' ? 0.04 : 0, 0.08);
      head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, moving ? Math.sin(cycle) * 0.018 : Math.sin(time * 0.85 + actor.seed) * 0.014, 0.1);
    }
    if (face.current) {
      face.current.rotation.z = THREE.MathUtils.lerp(face.current.rotation.z, moving ? Math.sin(cycle) * 0.02 : 0, 0.1);
    }
    if (tail.current) tail.current.rotation.z = Math.sin(time * (moving ? 5.5 : 1.5) + actor.seed) * (moving ? 0.1 : 0.045);
    if (scarf.current) scarf.current.rotation.z = Math.sin(time * (moving ? 5.5 : 1.5) + actor.seed) * (moving ? 0.1 : 0.035);
    if (leftFin.current) leftFin.current.rotation.z = THREE.MathUtils.lerp(leftFin.current.rotation.z, -0.22 + Math.sin(time * 1.9 + actor.seed) * 0.035, 0.1);
    if (rightFin.current) rightFin.current.rotation.z = THREE.MathUtils.lerp(rightFin.current.rotation.z, 0.22 - Math.sin(time * 1.9 + actor.seed) * 0.035, 0.1);
    if (leftArm.current) {
      leftArm.current.rotation.z = THREE.MathUtils.lerp(leftArm.current.rotation.z, -0.12 + (moving ? Math.sin(cycle) * 0.24 : 0), 0.16);
      leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, moving ? Math.cos(cycle) * 0.09 : 0, 0.12);
    }
    if (rightArm.current) {
      rightArm.current.rotation.z = THREE.MathUtils.lerp(rightArm.current.rotation.z, 0.12 - (moving ? Math.sin(cycle) * 0.24 : 0), 0.16);
      rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, moving ? -Math.cos(cycle) * 0.09 : 0, 0.12);
    }
    if (leftLeg.current) leftLeg.current.rotation.x = moving ? Math.sin(cycle) * 0.34 : 0;
    if (rightLeg.current) rightLeg.current.rotation.x = moving ? -Math.sin(cycle) * 0.34 : 0;

    const eyeHeight = actor.blinkUntil > time ? 0.08 : actor.mode === 'rest' ? 0.82 : 1;
    if (leftEye.current) leftEye.current.scale.y = THREE.MathUtils.lerp(leftEye.current.scale.y, eyeHeight, 0.5);
    if (rightEye.current) rightEye.current.scale.y = THREE.MathUtils.lerp(rightEye.current.scale.y, eyeHeight, 0.5);

    if (leftPupil.current) {
      leftPupil.current.position.x = glance;
      leftPupil.current.position.y = glanceHeight;
    }
    if (rightPupil.current) {
      rightPupil.current.position.x = glance;
      rightPupil.current.position.y = glanceHeight;
    }
    if (mouth.current) {
      const talking = actor.speakUntil > time;
      const opening = talking ? 0.5 + Math.abs(Math.sin(time * 13)) * 0.34 : actor.smileUntil > time ? 0.2 : 0.07;
      mouth.current.scale.y = THREE.MathUtils.lerp(mouth.current.scale.y, opening, 0.32);
    }
    if (smile.current) smile.current.scale.y = THREE.MathUtils.lerp(smile.current.scale.y, actor.smileUntil > time ? 1 : 0.72, 0.16);
  });

  return (
    <group ref={root} scale={0.82}>
      <group ref={tail} position={[0, 0.78, -0.31]}>
        <mesh geometry={tailGeometry} castShadow>
          <meshStandardMaterial color="#537d7f" roughness={0.65} />
        </mesh>
        <mesh position={[-0.3, 0.27, -0.36]}>
          <sphereGeometry args={[0.095, 12, 8]} />
          <meshStandardMaterial color="#d8ae62" emissive="#b97936" emissiveIntensity={0.45} roughness={0.4} />
        </mesh>
      </group>

      <group ref={body} position={[0, 0.1, 0]}>
        <mesh geometry={bodyGeometry} position={[0, 0.72, 0]} scale={[1.08, 1, 0.88]} castShadow>
          <meshStandardMaterial color="#294a54" roughness={0.78} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.74, 0.33]} scale={[0.54, 0.62, 0.1]}>
          <sphereGeometry args={[0.62, 24, 16]} />
          <meshStandardMaterial color="#e4d5bc" roughness={0.9} />
        </mesh>
        <mesh geometry={starGeometry} position={[0, 0.74, 0.43]} scale={0.16}>
          <meshStandardMaterial color="#e8bb6c" emissive="#bd7a31" emissiveIntensity={0.24} roughness={0.5} />
        </mesh>
      </group>

      <group ref={leftLeg} position={[-0.21, 0.31, 0.02]}>
        <mesh geometry={limbGeometry} position={[0, -0.16, 0]} castShadow>
          <meshStandardMaterial color="#203d49" roughness={0.82} />
        </mesh>
        <mesh position={[0, -0.42, 0.12]} scale={[1.12, 0.56, 1.42]} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshStandardMaterial color="#203d49" roughness={0.83} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.21, 0.31, 0.02]}>
        <mesh geometry={limbGeometry} position={[0, -0.16, 0]} castShadow>
          <meshStandardMaterial color="#203d49" roughness={0.82} />
        </mesh>
        <mesh position={[0, -0.42, 0.12]} scale={[1.12, 0.56, 1.42]} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshStandardMaterial color="#203d49" roughness={0.83} />
        </mesh>
      </group>

      <group ref={leftArm} position={[-0.43, 0.89, 0.01]}>
        <mesh geometry={limbGeometry} position={[0, -0.15, 0.04]} rotation={[0, 0, -0.08]} castShadow>
          <meshStandardMaterial color="#294a54" roughness={0.78} />
        </mesh>
        <mesh position={[0, -0.34, 0.1]} scale={[0.86, 0.8, 0.86]} castShadow>
          <sphereGeometry args={[0.13, 14, 10]} />
          <meshStandardMaterial color="#e4d5bc" roughness={0.84} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.43, 0.89, 0.01]}>
        <mesh geometry={limbGeometry} position={[0, -0.15, 0.04]} rotation={[0, 0, 0.08]} castShadow>
          <meshStandardMaterial color="#294a54" roughness={0.78} />
        </mesh>
        <mesh position={[0, -0.34, 0.1]} scale={[0.86, 0.8, 0.86]} castShadow>
          <sphereGeometry args={[0.13, 14, 10]} />
          <meshStandardMaterial color="#e4d5bc" roughness={0.84} />
        </mesh>
      </group>

      <group ref={scarf} position={[0, 1.22, 0]}>
        <mesh geometry={scarfGeometry} castShadow>
          <meshStandardMaterial color="#d39b68" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.02, 0.24]} scale={[0.7, 0.68, 0.75]}>
          <sphereGeometry args={[0.14, 16, 12]} />
          <meshStandardMaterial color="#e0ae62" roughness={0.55} />
        </mesh>
      </group>

      <group ref={head} position={[0, 1.47, 0]}>
        <mesh geometry={headGeometry} scale={[0.96, 1.04, 0.9]} castShadow>
          <meshStandardMaterial color="#3b626b" roughness={0.76} metalness={0.02} />
        </mesh>
        <mesh position={[0, -0.015, 0.47]} scale={[0.71, 0.78, 0.12]}>
          <sphereGeometry args={[0.55, 24, 16]} />
          <meshStandardMaterial color="#e7dbc5" roughness={0.88} />
        </mesh>

        <group ref={face}>
          <group ref={leftEye} position={[-0.17, 0.075, 0.525]}>
            <mesh scale={[0.85, 1, 0.22]}>
              <sphereGeometry args={[0.11, 20, 14]} />
              <meshStandardMaterial color="#fff4d8" roughness={0.38} />
            </mesh>
            <group ref={leftPupil} position={[0, 0, 0.036]}>
              <mesh scale={[0.72, 1, 0.3]}>
                <sphereGeometry args={[0.06, 16, 12]} />
                <meshStandardMaterial color="#253744" roughness={0.24} />
              </mesh>
              <mesh position={[0.018, 0.022, 0.018]}>
                <sphereGeometry args={[0.018, 10, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          </group>
          <group ref={rightEye} position={[0.17, 0.075, 0.525]}>
            <mesh scale={[0.85, 1, 0.22]}>
              <sphereGeometry args={[0.11, 20, 14]} />
              <meshStandardMaterial color="#fff4d8" roughness={0.38} />
            </mesh>
            <group ref={rightPupil} position={[0, 0, 0.036]}>
              <mesh scale={[0.72, 1, 0.3]}>
                <sphereGeometry args={[0.06, 16, 12]} />
                <meshStandardMaterial color="#253744" roughness={0.24} />
              </mesh>
              <mesh position={[0.018, 0.022, 0.018]}>
                <sphereGeometry args={[0.018, 10, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          </group>
          <mesh position={[-0.28, -0.09, 0.535]} scale={[1.2, 0.68, 0.2]}>
            <sphereGeometry args={[0.065, 14, 10]} />
            <meshStandardMaterial color="#e0a19a" transparent opacity={0.52} roughness={0.65} />
          </mesh>
          <mesh position={[0.28, -0.09, 0.535]} scale={[1.2, 0.68, 0.2]}>
            <sphereGeometry args={[0.065, 14, 10]} />
            <meshStandardMaterial color="#e0a19a" transparent opacity={0.52} roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.055, 0.57]} scale={[0.56, 0.56, 0.4]}>
            <sphereGeometry args={[0.045, 14, 10]} />
            <meshStandardMaterial color="#c48d78" roughness={0.62} />
          </mesh>
          <mesh ref={mouth} position={[0, -0.17, 0.555]} scale={[1, 0.07, 0.42]}>
            <sphereGeometry args={[0.085, 18, 12]} />
            <meshStandardMaterial color="#5d3b49" roughness={0.72} />
          </mesh>
          <mesh ref={smile} geometry={smileGeometry}>
            <meshBasicMaterial color="#754f53" />
          </mesh>
        </group>
      </group>

      <mesh ref={leftFin} geometry={finGeometry} position={[-0.49, 1.51, -0.04]} rotation={[0.2, -0.42, -0.86]} scale={[0.42, 0.7, 0.32]} castShadow>
        <meshStandardMaterial color="#527c80" roughness={0.72} />
      </mesh>
      <mesh ref={rightFin} geometry={finGeometry} position={[0.49, 1.51, -0.04]} rotation={[-0.2, 0.42, 0.86]} scale={[0.42, 0.7, 0.32]} castShadow>
        <meshStandardMaterial color="#527c80" roughness={0.72} />
      </mesh>
      <mesh position={[0, 2.02, -0.02]} rotation={[0, 0, 0.05]} scale={[0.16, 0.14, 0.13]}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshStandardMaterial color="#d9aa68" emissive="#b87937" emissiveIntensity={0.28} roughness={0.56} />
      </mesh>
    </group>
  );
}

function createNaverioScarf() {
  const group = new THREE.Group();
  group.name = 'naverio-scarf';
  const material = new THREE.MeshStandardMaterial({ color: '#d7a35e', roughness: 0.68, metalness: 0.02 });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(8.4, 1.35, 8, 24), material);
  collar.rotation.y = Math.PI / 2;
  collar.castShadow = true;
  group.add(collar);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.75, 1.5), material);
  tail.position.set(4.8, -4.2, 0);
  tail.rotation.z = -0.22;
  tail.castShadow = true;
  group.add(tail);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.45, 10, 8), new THREE.MeshStandardMaterial({ color: '#f0c776', roughness: 0.5 }));
  tip.position.set(7.2, -5.1, 0);
  tip.castShadow = true;
  group.add(tip);
  return group;
}

function RiggedFox({ destination, onReady, companion = false }) {
  const root = useRef();
  const modelRoot = useRef();
  const currentAction = useRef(null);
  const ready = useRef(false);
  const { scene, animations } = useGLTF('/models/naverio-fox.glb');
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, modelRoot);
  const bones = useMemo(() => ({
    neck: clonedScene.getObjectByName('b_Neck_04'),
    head: clonedScene.getObjectByName('b_Head_05'),
    tail: clonedScene.getObjectByName('b_Tail01_012'),
  }), [clonedScene]);
  const restRotations = useMemo(() => ({
    neck: bones.neck?.rotation.clone(),
    head: bones.head?.rotation.clone(),
    tail: bones.tail?.rotation.clone(),
  }), [bones]);
  const scarf = useMemo(() => (companion ? null : createNaverioScarf()), [companion]);
  const initial = companion ? { x: 10.2, z: -1.8 } : { x: -1.45, z: -2.15 };
  const state = useRef({
    x: initial.x,
    z: initial.z,
    targetX: initial.x,
    targetZ: initial.z,
    finalX: initial.x,
    finalZ: initial.z,
    waypoint: false,
    repathAt: 0,
    radius: companion ? 0.42 : 0.5,
    mode: 'rest',
    modeUntil: companion ? 5.2 : 3.8,
    lastDestination: 0,
    heading: companion ? Math.PI * 0.5 : 0,
    stuckTime: 0,
    seed: companion ? 4.2 : 1.7,
  });

  useEffect(() => {
    clonedScene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }, [clonedScene]);

  useEffect(() => {
    if (!scarf || !bones.neck) return undefined;
    bones.neck.add(scarf);
    return () => bones.neck.remove(scarf);
  }, [bones.neck, scarf]);

  useEffect(() => {
    if (!scarf) return undefined;
    return () => scarf.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
  }, [scarf]);

  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
    onReady?.();
  }, [scene, onReady]);

  useEffect(() => {
    const idle = actions?.Survey || actions?.Idle || Object.values(actions || {})[0];
    if (!idle) return undefined;
    idle.reset().fadeIn(0.3).play();
    currentAction.current = idle;
    return () => idle.fadeOut(0.2);
  }, [actions]);

  useFrame(({ clock }, delta) => {
    if (!root.current || !actions) return;
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 0.06);
    const actor = state.current;

    if (!companion && destination && destination.id !== actor.lastDestination) {
      actor.lastDestination = destination.id;
      setActorGoal(actor, destination.x, destination.z);
      actor.mode = 'walk';
      actor.modeUntil = time + 18;
    }

    if (time > actor.modeUntil) {
      const roll = Math.random();
      if (roll < 0.62) {
        const [x, z] = SAFE_SPOTS[(Math.floor(time * 2) + Math.floor(actor.seed * 10)) % SAFE_SPOTS.length];
        setActorGoal(actor, x + (Math.random() - 0.5) * 1.1, z + (Math.random() - 0.5) * 1.1);
        actor.mode = roll < 0.12 ? 'run' : 'walk';
        actor.modeUntil = time + (companion ? 10 : 15) + Math.random() * 9;
      } else if (roll < 0.8) {
        actor.mode = 'observe';
        actor.heading += (Math.random() - 0.5) * 1.8;
        actor.modeUntil = time + 2.6 + Math.random() * 3.8;
      } else {
        actor.mode = 'rest';
        actor.modeUntil = time + 3.4 + Math.random() * 4.5;
      }
    }

    if (!actor.waypoint && time >= actor.repathAt && lineIsBlocked(actor.x, actor.z, actor.finalX, actor.finalZ, actor.radius)) {
      const detour = findDetourPoint(actor.x, actor.z, actor.finalX, actor.finalZ, actor.radius);
      if (detour) {
        actor.targetX = detour.x;
        actor.targetZ = detour.z;
        actor.waypoint = true;
      }
      actor.repathAt = time + 0.7;
    }

    const dx = actor.targetX - actor.x;
    const dz = actor.targetZ - actor.z;
    const distance = Math.hypot(dx, dz);
    const movingToTarget = (actor.mode === 'walk' || actor.mode === 'run') && distance > 0.16;
    if (movingToTarget) {
      const speed = actor.mode === 'run' ? 1.35 : 0.66;
      const step = Math.min(distance, speed * dt);
      const moved = tryMove(actor, (dx / distance) * step, (dz / distance) * step);
      if (!moved) {
        actor.stuckTime += dt;
        const detour = findDetourPoint(actor.x, actor.z, actor.finalX, actor.finalZ, actor.radius);
        if (detour) {
          actor.targetX = detour.x;
          actor.targetZ = detour.z;
          actor.waypoint = true;
        }
        if (actor.stuckTime > 0.85) {
          const [escapeX, escapeZ] = SAFE_SPOTS[(Math.floor(time * 3) + Math.floor(actor.seed)) % SAFE_SPOTS.length];
          setActorGoal(actor, escapeX, escapeZ);
          actor.mode = 'walk';
          actor.modeUntil = time + 12;
          actor.stuckTime = 0;
        }
      } else {
        actor.stuckTime = 0;
      }
      actor.heading = THREE.MathUtils.lerp(actor.heading, Math.atan2(dx, dz), 0.13);
    } else if (actor.mode === 'walk' || actor.mode === 'run') {
      if (actor.waypoint) {
        actor.waypoint = false;
        actor.targetX = actor.finalX;
        actor.targetZ = actor.finalZ;
        actor.repathAt = time + 0.05;
      } else {
        actor.mode = 'observe';
        actor.modeUntil = time + 2.2 + Math.random() * 2.8;
      }
    }

    const safe = safeDestination(actor.x, actor.z, actor.radius);
    actor.x = safe.x;
    actor.z = safe.z;
    const moving = movingToTarget;
    root.current.position.set(actor.x, groundHeight(actor.x, actor.z) + (companion ? 0.015 : 0.02), actor.z);
    root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, actor.heading, 0.12);

    const clipName = moving ? (actor.mode === 'run' ? 'Run' : 'Walk') : 'Survey';
    const nextAction = actions[clipName] || actions.Survey || Object.values(actions)[0];
    if (nextAction && nextAction !== currentAction.current) {
      nextAction.reset().fadeIn(0.28).play();
      currentAction.current?.fadeOut(0.28);
      currentAction.current = nextAction;
    }

    const look = Math.sin(time * (actor.mode === 'observe' ? 0.8 : 0.25) + actor.seed) * (actor.mode === 'observe' ? 0.38 : 0.16);
    const lookUp = Math.cos(time * 0.44 + actor.seed) * 0.12;
    if (bones.neck && restRotations.neck) {
      bones.neck.rotation.y = THREE.MathUtils.lerp(bones.neck.rotation.y, restRotations.neck.y + look * 0.22, 0.12);
      bones.neck.rotation.z = THREE.MathUtils.lerp(bones.neck.rotation.z, restRotations.neck.z + lookUp * 0.12, 0.12);
    }
    if (bones.head && restRotations.head) {
      bones.head.rotation.y = THREE.MathUtils.lerp(bones.head.rotation.y, restRotations.head.y + look * 0.46, 0.12);
      bones.head.rotation.z = THREE.MathUtils.lerp(bones.head.rotation.z, restRotations.head.z + lookUp * 0.16, 0.12);
    }
    if (bones.tail && restRotations.tail) {
      bones.tail.rotation.z = THREE.MathUtils.lerp(bones.tail.rotation.z, restRotations.tail.z + Math.sin(time * (moving ? 5.5 : 1.7) + actor.seed) * (moving ? 0.12 : 0.06), 0.1);
    }
  });

  return (
    <group ref={root}>
      <group ref={modelRoot} scale={companion ? 0.013 : 0.018} rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
}

function CameraBounds() {
  const controls = useThree((state) => state.controls);
  useFrame(() => {
    if (!controls) return;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -8.5, 8.5);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -8.5, 8.5);
    controls.object.position.x = THREE.MathUtils.clamp(controls.object.position.x, -18, 18);
    controls.object.position.z = THREE.MathUtils.clamp(controls.object.position.z, -18, 18);
  });
  return null;
}

function SceneFallback({ onReady }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div className="scene-fallback" role="img" aria-label="Prévia visual do bairro de Navério">
      <div className="fallback-sun" />
      <div className="fallback-cloud fallback-cloud-one" />
      <div className="fallback-cloud fallback-cloud-two" />
      <div className="fallback-horizon" />
      <div className="fallback-road fallback-road-main" />
      <div className="fallback-road fallback-road-side" />
      <div className="fallback-building fallback-building-left">
        <span /><span /><span />
      </div>
      <div className="fallback-building fallback-building-right">
        <span /><span /><span /><span />
      </div>
      <div className="fallback-house">
        <i />
        <b />
        <em />
      </div>
      <div className="fallback-tree fallback-tree-left"><i /><b /></div>
      <div className="fallback-tree fallback-tree-right"><i /><b /></div>
      <div className="fallback-nav"><span className="fallback-scarf" /><span className="fallback-eye fallback-eye-left" /><span className="fallback-eye fallback-eye-right" /><span className="fallback-mouth" /><span className="fallback-star">✦</span></div>
      <div className="fallback-note">O bairro continua vivo quando o WebGL estiver disponível.</div>
    </div>
  );
}

function browserHasWebGL() {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export default function World({ onReady }) {
  const [webglAvailable, setWebglAvailable] = useState(null);
  const [destination, setDestination] = useState(null);
  const destinationId = useRef(0);

  useEffect(() => {
    setWebglAvailable(browserHasWebGL());
  }, []);

  const selectDestination = useCallback((x, z, kind = 'street') => {
    const next = safeDestination(x, z);
    destinationId.current += 1;
    setDestination({ ...next, kind, id: destinationId.current });
  }, []);

  if (webglAvailable === null) return null;
  if (!webglAvailable) return <SceneFallback onReady={onReady} />;

  return (
    <Canvas
      shadows
      dpr={[1, 1.45]}
      camera={{ position: [13.2, 14.8, 17.6], fov: 41, near: 0.1, far: 90 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      fallback={<SceneFallback onReady={onReady} />}
    >
      <color attach="background" args={['#9db6b4']} />
      <fog attach="fog" args={['#9db6b4', 28, 58]} />
      <Sky distance={450} sunPosition={[-10, 18, 8]} inclination={0.48} azimuth={0.24} turbidity={6.6} rayleigh={1.15} mieCoefficient={0.012} mieDirectionalG={0.78} />
      <ambientLight intensity={1.2} color="#eef1e7" />
      <hemisphereLight intensity={0.72} color="#fff5dd" groundColor="#60796c" />
      <directionalLight
        castShadow
        position={[-11, 18, 9]}
        intensity={2.15}
        color="#ffe0af"
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.00015}
      />
      <CityWorld onSelect={selectDestination} />
      <InteractionMarker destination={destination} />
      <RiggedFox destination={destination} onReady={onReady} />
      <RiggedFox companion />
      <ContactShadows position={[0, 0.08, 0]} opacity={0.22} scale={29} blur={2.8} far={8} resolution={512} />
      <MapControls
        makeDefault
        enableRotate={false}
        enablePan
        enableZoom
        screenSpacePanning
        panSpeed={1.06}
        zoomSpeed={0.65}
        minDistance={10}
        maxDistance={24}
        enableDamping
        dampingFactor={0.08}
        target={[0, 0, 0]}
      />
      <CameraBounds />
    </Canvas>
  );
}
