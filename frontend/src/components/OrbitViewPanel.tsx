import { useEffect, useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { FAMOUS_NEOS, type FamousNEO } from "../lib/famous_neos";
import {
  currentJD,
  heliocentricPositionAtJD,
  orbitEllipsePoints,
} from "../lib/kepler";

/**
 * Option B: heliocentric Orbit View.
 *
 * Sun at origin, inner planets as clean circles, famous NEOs as
 * Keplerian ellipses with current-position dots. Matches the NASA
 * Eyes mental model — "where does this thing actually live in the
 * solar system". Toggles against the geocentric Sky View; each
 * answers a different question:
 *
 *   Sky View (geocentric): "what can my telescope see tonight"
 *   Orbit View (heliocentric): "what does the orbital geometry tell
 *                               me about risk / mission context"
 *
 * 1 scene unit = 1 AU. Camera range 0.4 AU (Sun close-up) to 10 AU
 * (outer comet aphelion). Auto-rotate off by default — this is a
 * read-the-geometry view, not an ambient mood view.
 */

interface Props {
  onSelectFamousNEO?: (designation: string) => void;
  selectedDesignation: string | null;
}

const PLANETS = [
  { name: "Mercury", a_au: 0.3871, color: "#a8a29e", size_au: 0.035 },
  { name: "Venus", a_au: 0.7233, color: "#fde68a", size_au: 0.05 },
  { name: "Earth", a_au: 1.0, color: "#60a5fa", size_au: 0.055 },
  { name: "Mars", a_au: 1.5237, color: "#f87171", size_au: 0.045 },
];

function Sun() {
  const glowRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (glowRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 1.2) * 0.04;
      glowRef.current.scale.setScalar(pulse);
    }
  });
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.07, 32, 32]} />
        <meshBasicMaterial color="#fef3c7" />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.16, 32, 32]} />
        <meshBasicMaterial
          color="#fcd34d"
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>
      <pointLight color="#fff4e0" intensity={2.4} decay={2} distance={30} />
      <Html center position={[0, 0.25, 0]}>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 9,
            color: "#fcd34d",
            letterSpacing: 1.5,
            opacity: 0.9,
            pointerEvents: "none",
            userSelect: "none",
            textShadow: "0 0 6px rgba(0,0,0,0.9)",
          }}
        >
          SUN
        </div>
      </Html>
    </group>
  );
}

function PlanetOrbitCircle({
  a_au,
  color,
  segments = 128,
}: {
  a_au: number;
  color: string;
  segments?: number;
}) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      positions[i * 3] = a_au * Math.cos(t);
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = -a_au * Math.sin(t);
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [a_au, segments]);
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
      }),
    [color],
  );
  const line = useMemo(() => new THREE.Line(geom, material), [geom, material]);
  useEffect(
    () => () => {
      geom.dispose();
      material.dispose();
    },
    [geom, material],
  );
  return <primitive object={line} />;
}

function Planet({
  name,
  a_au,
  color,
  size_au,
  currentAngleRad,
}: {
  name: string;
  a_au: number;
  color: string;
  size_au: number;
  currentAngleRad: number;
}) {
  const x = a_au * Math.cos(currentAngleRad);
  const z = -a_au * Math.sin(currentAngleRad);
  return (
    <group position={[x, 0, z]}>
      <mesh>
        <sphereGeometry args={[size_au, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
        />
      </mesh>
      <Html
        center
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 9,
            color,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            transform: `translate(${size_au * 100 + 8}px, -50%)`,
            opacity: 0.85,
            textShadow: "0 0 6px rgba(0,0,0,0.9)",
          }}
        >
          {name}
        </div>
      </Html>
    </group>
  );
}

function EclipticDisk() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.15, 4.5, 128]} />
      <meshBasicMaterial
        color="#1e293b"
        transparent
        opacity={0.14}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function orbitClassColor(orbit_class: FamousNEO["orbit_class"]): string {
  switch (orbit_class) {
    case "Apollo":
      return "#f87171";
    case "Aten":
      return "#fb923c";
    case "Amor":
      return "#fbbf24";
    case "Atira":
      return "#a78bfa";
    case "Comet":
      return "#60a5fa";
    case "MBA":
      return "#64748b";
  }
}

interface ComputedOrbit {
  neo: FamousNEO;
  ellipse: Array<[number, number, number]>;
  currentPos: [number, number, number];
}

function useComputedOrbits(): ComputedOrbit[] {
  return useMemo(() => {
    const jd = currentJD();
    return FAMOUS_NEOS.map((neo) => {
      const ellipse = orbitEllipsePoints(neo.orbit, 128);
      const currentPos = heliocentricPositionAtJD(neo.orbit, jd);
      return {
        neo,
        // Note: Three.js uses right-handed Y-up but our kepler frame is
        // ecliptic (Z-up). Remap Z_ec → Y_tj, Y_ec → -Z_tj so the scene
        // matches the visual convention (camera looks down -Z).
        ellipse: ellipse.map(([x, y, z]): [number, number, number] => [
          x,
          z,
          -y,
        ]),
        currentPos: [currentPos[0], currentPos[2], -currentPos[1]],
      };
    });
  }, []);
}

function NEOOrbit({
  orbit,
  selected,
  onClick,
}: {
  orbit: ComputedOrbit;
  selected: boolean;
  onClick?: () => void;
}) {
  const color = orbitClassColor(orbit.neo.orbit_class);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(orbit.ellipse.length * 3);
    for (let i = 0; i < orbit.ellipse.length; i++) {
      positions[i * 3] = orbit.ellipse[i][0];
      positions[i * 3 + 1] = orbit.ellipse[i][1];
      positions[i * 3 + 2] = orbit.ellipse[i][2];
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [orbit.ellipse]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: selected ? 0.9 : 0.35,
      }),
    [color, selected],
  );

  const line = useMemo(() => new THREE.Line(geom, material), [geom, material]);
  useEffect(
    () => () => {
      geom.dispose();
      material.dispose();
    },
    [geom, material],
  );

  const sizeBase = orbit.neo.is_neo ? 0.04 : 0.028;
  const size = selected ? sizeBase * 1.6 : sizeBase;

  return (
    <>
      <primitive object={line} />
      <mesh
        position={orbit.currentPos}
        onClick={
          onClick
            ? (e) => {
                e.stopPropagation();
                onClick();
              }
            : undefined
        }
        onPointerOver={
          onClick
            ? (e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }
            : undefined
        }
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.3 : 0.55}
        />
      </mesh>
      {(selected || orbit.neo.is_pha) && (
        <Html
          position={orbit.currentPos}
          center
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              color: selected ? "#f1f5f9" : color,
              letterSpacing: 0.3,
              whiteSpace: "nowrap",
              transform: `translate(${size * 120 + 8}px, -50%)`,
              opacity: selected ? 1 : 0.8,
              textShadow: "0 0 6px rgba(0,0,0,0.95)",
            }}
          >
            {orbit.neo.name}
            {orbit.neo.is_pha && !selected && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 8,
                  color: "#fca5a5",
                  letterSpacing: 1.2,
                }}
              >
                PHA
              </span>
            )}
          </div>
        </Html>
      )}
    </>
  );
}

function currentEarthAngleRad(): number {
  // Earth mean longitude minus longitude of perihelion, approximated as
  // true longitude (good enough for a visual dot placement).
  const jd = currentJD();
  const L_deg = 100.46435 + 0.9856474 * (jd - 2451545.0);
  const L_rad = (L_deg * Math.PI) / 180;
  // Normalize to [0, 2π).
  return ((L_rad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

function currentPlanetAngleRad(a_au: number): number {
  // Very rough: Kepler III period, assume near-circular mean motion
  // starting from a fixed epoch offset chosen for plausible spread.
  const period_years = Math.pow(a_au, 1.5);
  const jd = currentJD();
  const dt_years = (jd - 2451545.0) / 365.25;
  return ((2 * Math.PI * dt_years) / period_years) % (2 * Math.PI);
}

export function OrbitViewPanel({
  onSelectFamousNEO,
  selectedDesignation,
}: Props) {
  const orbits = useComputedOrbits();
  const earthAngle = useMemo(() => currentEarthAngleRad(), []);

  return (
    <Canvas
      camera={{ position: [2.2, 1.6, 2.2], fov: 52 }}
      style={{ background: "#030509" }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.25} />
      <Suspense fallback={null}>
        <Stars
          radius={80}
          depth={40}
          count={5000}
          factor={3}
          saturation={0}
          fade
          speed={0.2}
        />
        <EclipticDisk />
        <Sun />
        {PLANETS.map((p) => (
          <PlanetOrbitCircle key={`orbit-${p.name}`} a_au={p.a_au} color={p.color} />
        ))}
        {PLANETS.map((p) => (
          <Planet
            key={`planet-${p.name}`}
            name={p.name}
            a_au={p.a_au}
            color={p.color}
            size_au={p.size_au}
            currentAngleRad={
              p.name === "Earth" ? earthAngle : currentPlanetAngleRad(p.a_au)
            }
          />
        ))}
        {orbits.map((o) => (
          <NEOOrbit
            key={`neo-${o.neo.designation}`}
            orbit={o}
            selected={o.neo.designation === selectedDesignation}
            onClick={
              onSelectFamousNEO
                ? () => onSelectFamousNEO(o.neo.designation)
                : undefined
            }
          />
        ))}
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={0.4}
        maxDistance={10}
        autoRotate={false}
      />
    </Canvas>
  );
}
