import { useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RankedCandidate } from "../api/types";
import { radec_to_xyz } from "../lib/celestial";
import { computeTorinoFromCandidate } from "../lib/torino";
import { FAMOUS_NEOS, type FamousNEO } from "../lib/famous_neos";

interface Props {
  candidates: RankedCandidate[];
  selectedTrksub: string | null;
  onCandidateClick: (trksub: string) => void;
}

const SPHERE_RADIUS = 4;
const EARTH_RADIUS = 0.6;

function Earth() {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);

  // Textures loaded via drei — public/textures copied from Three.js examples
  // (BSD-licensed). Full color + specular + night lights + cloud layer.
  const [colorMap, specMap, lightsMap, cloudsMap] = useLoader(
    THREE.TextureLoader,
    [
      "/textures/earth_atmos_2048.jpg",
      "/textures/earth_specular_2048.jpg",
      "/textures/earth_lights_2048.png",
      "/textures/earth_clouds_1024.png",
    ],
  );

  useFrame((_, delta) => {
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.03;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.045;
  });

  return (
    <group>
      {/* Earth body */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshStandardMaterial
          map={colorMap}
          roughnessMap={specMap}
          roughness={0.85}
          metalness={0.05}
          emissiveMap={lightsMap}
          emissive="#ffbb66"
          emissiveIntensity={0.55}
        />
      </mesh>

      {/* Clouds — transparent, offset rotation rate for parallax */}
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[EARTH_RADIUS * 1.012, 96, 96]} />
        <meshStandardMaterial
          map={cloudsMap}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      {/* Atmosphere inner glow */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.05, 64, 64]} />
        <meshBasicMaterial
          color="#4aa8ff"
          transparent
          opacity={0.18}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      {/* Atmosphere outer glow */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.14, 64, 64]} />
        <meshBasicMaterial
          color="#6ac0ff"
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Deterministic seeded PRNG (mulberry32) — keeps the background NEO field
 * stable across renders and keeps useMemo pure for the lint rule.
 */
function mulberry32(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBackgroundNEOGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(0xC70E); // stable seed — looks like "70E" in hex
  const count = 3200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    // Flatten toward the ecliptic — NEOs cluster near it
    const phi_raw = Math.acos(2 * v - 1);
    const phi = Math.PI / 2 + (phi_raw - Math.PI / 2) * 0.55;
    const radius = 5 + rng() * 13;

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    if (rng() < 0.08) {
      colors[i * 3] = 0.85;
      colors[i * 3 + 1] = 0.7;
      colors[i * 3 + 2] = 0.5;
    } else {
      colors[i * 3] = 0.45 + rng() * 0.2;
      colors[i * 3 + 1] = 0.55 + rng() * 0.2;
      colors[i * 3 + 2] = 0.8 + rng() * 0.2;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geom;
}

// Module-level const — generated exactly once, at module load.
const BACKGROUND_NEO_GEOMETRY = buildBackgroundNEOGeometry();

function BackgroundNEOField() {
  return (
    <points geometry={BACKGROUND_NEO_GEOMETRY} raycast={() => null}>
      <pointsMaterial
        vertexColors
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.65}
        depthWrite={false}
      />
    </points>
  );
}

interface MarkerProps {
  candidate: RankedCandidate;
  selected: boolean;
  onClick: () => void;
}

/**
 * Generate a short tangent vector at the candidate's sky position,
 * representing projected sky-plane motion over the next few hours. We don't
 * have a position angle in the tracklet, so we synthesize a deterministic
 * tangent (perpendicular to the position vector in the local ecliptic frame).
 * Length scales with rate_arcsec_min — faster objects get longer tracks.
 */
function motionTrack(
  candidate: RankedCandidate,
  position: THREE.Vector3,
): THREE.Vector3[] {
  // Tangent direction: derivative of position on sphere along RA is
  // roughly (-sin(ra), 0, -cos(ra)) * cos(dec). We'll nudge it by dec
  // so the arc has a small latitude component too — makes it feel real.
  const ra_rad = (candidate.ra_deg * Math.PI) / 180;
  const dec_rad = (candidate.dec_deg * Math.PI) / 180;
  const tangent = new THREE.Vector3(
    -Math.sin(ra_rad) * Math.cos(dec_rad),
    Math.sin(dec_rad) * 0.15,
    -Math.cos(ra_rad) * Math.cos(dec_rad),
  ).normalize();

  // Length proportional to rate, capped
  const rate = candidate.rate_arcsec_min ?? 0.5;
  const halfLen = Math.min(0.55, 0.15 + rate * 0.08);

  const p0 = position.clone().sub(tangent.clone().multiplyScalar(halfLen));
  const p1 = position.clone().add(tangent.clone().multiplyScalar(halfLen));
  // Keep on-sphere: re-project to sphere surface
  p0.setLength(position.length());
  p1.setLength(position.length());
  return [p0, p1];
}

function MotionTrack({ candidate, selected, position }: {
  candidate: RankedCandidate;
  selected: boolean;
  position: THREE.Vector3;
}) {
  const points = useMemo(
    () => motionTrack(candidate, position),
    [candidate, position],
  );
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setFromPoints(points);
    return g;
  }, [points]);

  const material = useMemo(() => {
    const torino = computeTorinoFromCandidate(
      candidate.impact_probability,
      candidate.absolute_magnitude_h,
    );
    let color = 0x3b82f6;
    if (torino.scale >= 3) color = 0xef4444;
    else if (torino.scale >= 2) color = 0xf59e0b;
    else if (torino.scale >= 1) color = 0xeab308;
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.95 : 0.22,
      linewidth: selected ? 2 : 1,
    });
  }, [candidate, selected]);

  return <primitive object={new THREE.Line(geom, material)} />;
}

function CandidateMarker({ candidate, selected, onClick }: MarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const position = useMemo(() => {
    const p = radec_to_xyz(candidate.ra_deg, candidate.dec_deg, SPHERE_RADIUS);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, [candidate.ra_deg, candidate.dec_deg]);

  const torino = computeTorinoFromCandidate(
    candidate.impact_probability,
    candidate.absolute_magnitude_h,
  );
  const isHero = candidate.trksub === "P21YR4A";

  let color = "#3b82f6";
  if (torino.scale >= 3) color = "#ef4444";
  else if (torino.scale === 2) color = "#f59e0b";
  else if (torino.scale === 1) color = "#eab308";

  const baseSize = isHero ? 0.09 : torino.scale >= 3 ? 0.075 : 0.055;
  const size = selected || hovered ? baseSize * 1.45 : baseSize;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (isHero) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.22;
      meshRef.current.scale.set(pulse, pulse, pulse);
    } else if (selected) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.14;
      meshRef.current.scale.set(pulse, pulse, pulse);
    } else {
      meshRef.current.scale.set(1, 1, 1);
    }
  });

  const showLabel = isHero || selected || hovered || torino.scale >= 3;

  return (
    <>
      <MotionTrack
        candidate={candidate}
        selected={selected}
        position={position}
      />
      <group position={[position.x, position.y, position.z]}>
        <mesh
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
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
            emissiveIntensity={selected || isHero ? 1.6 : hovered ? 1.1 : 0.55}
          />
        </mesh>
        {(isHero || selected) && (
          <mesh>
            <sphereGeometry args={[size * 1.9, 24, 24]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={selected ? 0.25 : 0.15}
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
                background: "rgba(10,10,15,0.72)",
                padding: "2px 6px",
                borderRadius: 3,
                border: "1px solid rgba(255,255,255,0.1)",
                whiteSpace: "nowrap",
                transform: `translate(${size * 28 + 6}px, -50%)`,
              }}
            >
              <div style={{ color }}>{candidate.trksub}</div>
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
    </>
  );
}

function CelestialGrid() {
  const points_equator: [number, number, number][] = [];
  const points_ecliptic: [number, number, number][] = [];
  const segments = 128;
  const tilt = (23.44 * Math.PI) / 180;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = SPHERE_RADIUS * Math.cos(theta);
    const z = -SPHERE_RADIUS * Math.sin(theta);
    points_equator.push([x, 0, z]);
    const y_ecl = SPHERE_RADIUS * Math.sin(theta) * Math.sin(tilt);
    const z_ecl = -SPHERE_RADIUS * Math.sin(theta) * Math.cos(tilt);
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
              opacity: 0.35,
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
              opacity: 0.3,
            }),
          )
        }
      />
    </>
  );
}

function Sun() {
  return (
    <directionalLight
      position={[12, 4, 8]}
      intensity={1.4}
      color="#fff4e0"
      castShadow={false}
    />
  );
}

/**
 * Backdrop of famous NEOs / small bodies — Bennu, Apophis, Didymos, Ryugu,
 * Itokawa, Eros, and friends. Non-interactive, rendered as white markers
 * with a short designation so the viewer recognises the field as "the
 * asteroid catalog you've heard of" without us claiming live ephemerides.
 */
function FamousNEOField() {
  return (
    <>
      {FAMOUS_NEOS.map((neo) => (
        <FamousNEOMarker key={`${neo.designation}-${neo.name}`} neo={neo} />
      ))}
    </>
  );
}

function FamousNEOMarker({ neo }: { neo: FamousNEO }) {
  const [hovered, setHovered] = useState(false);
  const pos = useMemo(
    () => radec_to_xyz(neo.ra_deg, neo.dec_deg, SPHERE_RADIUS * 1.02),
    [neo.ra_deg, neo.dec_deg],
  );
  const orbitColor =
    neo.orbit_class === "Apollo" || neo.orbit_class === "Aten"
      ? "#cbd5e1"
      : neo.orbit_class === "Comet"
        ? "#a78bfa"
        : "#94a3b8";
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        raycast={() => null}
      >
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color={orbitColor} transparent opacity={0.65} />
      </mesh>
      <Html
        center
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 9,
            color: hovered ? "#f1f5f9" : "#94a3b8",
            whiteSpace: "nowrap",
            transform: "translate(10px, -50%)",
            opacity: 0.75,
            letterSpacing: 0.2,
          }}
        >
          {neo.name}
        </div>
      </Html>
    </group>
  );
}

export function SkyViewPanel({
  candidates,
  selectedTrksub,
  onCandidateClick,
}: Props) {
  return (
    <Canvas
      camera={{ position: [0, 1.4, 6.5], fov: 50 }}
      style={{ background: "#02040a" }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.18} />
      <Sun />
      <pointLight position={[-10, -4, -6]} intensity={0.22} color="#4488ff" />

      <Suspense fallback={null}>
        <Stars
          radius={90}
          depth={50}
          count={7000}
          factor={3}
          saturation={0}
          fade
          speed={0.4}
        />
        <BackgroundNEOField />
        <Earth />
        <CelestialGrid />
        <FamousNEOField />
        {candidates.map((c) => (
          <CandidateMarker
            key={c.trksub}
            candidate={c}
            selected={c.trksub === selectedTrksub}
            onClick={() => onCandidateClick(c.trksub)}
          />
        ))}
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={2.2}
        maxDistance={16}
        autoRotate
        autoRotateSpeed={0.35}
      />
    </Canvas>
  );
}
