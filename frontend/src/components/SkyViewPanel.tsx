import { useRef, useState, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RankedCandidate } from "../api/types";
import { radec_to_xyz } from "../lib/celestial";
import { computeTorinoFromCandidate } from "../lib/torino";

interface Props {
  candidates: RankedCandidate[];
  selectedTrksub: string | null;
  onSelectCandidate: (trksub: string) => void;
}

const SPHERE_RADIUS = 4;
const EARTH_RADIUS = 1;

function Earth() {
  const earthRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (earthRef.current) earthRef.current.rotation.y += 0.0015;
  });
  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshStandardMaterial
          color="#3a6fb5"
          roughness={0.7}
          metalness={0.1}
          emissive="#0a1a33"
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* Atmosphere glow shell */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.05, 64, 64]} />
        <meshBasicMaterial
          color="#5aa6ff"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.12, 64, 64]} />
        <meshBasicMaterial
          color="#5aa6ff"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

interface MarkerProps {
  candidate: RankedCandidate;
  selected: boolean;
  onSelect: () => void;
}

function CandidateMarker({ candidate, selected, onSelect }: MarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const pos = radec_to_xyz(candidate.ra_deg, candidate.dec_deg, SPHERE_RADIUS);

  const pPha = candidate.prediction.prob_pha ?? 0;
  const torino = computeTorinoFromCandidate(
    candidate.impact_probability,
    candidate.absolute_magnitude_h,
  );
  const isHero = candidate.trksub === "P21YR4A";

  // Color by Torino scale first, then P(PHA) fallback
  let color = "#3b82f6"; // blue — low
  if (torino.scale >= 3) color = "#ef4444"; // red
  else if (torino.scale === 2) color = "#f59e0b"; // amber
  else if (torino.scale === 1) color = "#eab308"; // yellow
  else if (pPha > 0.1) color = "#f59e0b";

  const baseSize = isHero ? 0.13 : torino.scale >= 3 ? 0.1 : 0.07;
  const size = selected || hovered ? baseSize * 1.4 : baseSize;

  // Pulse animation for hero
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (isHero) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.25;
      meshRef.current.scale.set(pulse, pulse, pulse);
    } else if (selected) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.1;
      meshRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  const showLabel = isHero || selected || hovered || torino.scale >= 3;

  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected || isHero ? 1.5 : hovered ? 1.0 : 0.5}
        />
      </mesh>
      {/* Halo for hero */}
      {isHero && (
        <mesh>
          <sphereGeometry args={[size * 1.8, 24, 24]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </mesh>
      )}
      {showLabel && (
        <Html
          center
          distanceFactor={10}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              color: "#e5e7eb",
              background: "rgba(10,10,15,0.7)",
              padding: "2px 6px",
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.1)",
              whiteSpace: "nowrap",
              transform: `translate(${size * 30 + 6}px, -50%)`,
            }}
          >
            <div style={{ color: color }}>{candidate.trksub}</div>
            {(selected || hovered) && (
              <div style={{ color: "#9ca3af", fontSize: 9, marginTop: 2 }}>
                P(NEO) {candidate.prediction.prob_neo.toFixed(2)} ·{" "}
                {torino.label} · V {candidate.mean_magnitude_v.toFixed(1)}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function CelestialGrid() {
  // Thin ecliptic + equator reference circles for orientation
  const points_equator = [] as [number, number, number][];
  const points_ecliptic = [] as [number, number, number][];
  const segments = 128;
  const ecliptic_tilt_rad = (23.4 * Math.PI) / 180;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = SPHERE_RADIUS * Math.cos(theta);
    const z = -SPHERE_RADIUS * Math.sin(theta);
    points_equator.push([x, 0, z]);
    const y_ecl = SPHERE_RADIUS * Math.sin(theta) * Math.sin(ecliptic_tilt_rad);
    const z_ecl = -SPHERE_RADIUS * Math.sin(theta) * Math.cos(ecliptic_tilt_rad);
    points_ecliptic.push([x, y_ecl, z_ecl]);
  }

  const equatorGeom = new THREE.BufferGeometry().setFromPoints(
    points_equator.map((p) => new THREE.Vector3(...p)),
  );
  const eclipticGeom = new THREE.BufferGeometry().setFromPoints(
    points_ecliptic.map((p) => new THREE.Vector3(...p)),
  );

  return (
    <>
      <primitive
        object={
          new THREE.Line(
            equatorGeom,
            new THREE.LineBasicMaterial({
              color: 0x334155,
              transparent: true,
              opacity: 0.4,
            }),
          )
        }
      />
      <primitive
        object={
          new THREE.Line(
            eclipticGeom,
            new THREE.LineBasicMaterial({
              color: 0x7c3aed,
              transparent: true,
              opacity: 0.35,
            }),
          )
        }
      />
    </>
  );
}

export function SkyViewPanel({
  candidates,
  selectedTrksub,
  onSelectCandidate,
}: Props) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 7], fov: 50 }}
      style={{ background: "#04060a" }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.35} />
      <pointLight position={[10, 8, 10]} intensity={1.2} />
      <pointLight position={[-10, -5, -5]} intensity={0.3} color="#5aa6ff" />

      <Suspense fallback={null}>
        <Stars
          radius={80}
          depth={40}
          count={6000}
          factor={3}
          saturation={0}
          fade
          speed={0.5}
        />
        <Earth />
        <CelestialGrid />
        {candidates.map((c) => (
          <CandidateMarker
            key={c.trksub}
            candidate={c}
            selected={c.trksub === selectedTrksub}
            onSelect={() => onSelectCandidate(c.trksub)}
          />
        ))}
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={14}
        autoRotate
        autoRotateSpeed={0.4}
      />
    </Canvas>
  );
}
