'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Points, PointMaterial } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

function GlassKnot({
  position,
  color,
  scale = 1,
  speed = 1,
}: {
  position: [number, number, number]
  color: string
  scale?: number
  speed?: number
}) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    ref.current.rotation.x = t * 0.15 * speed
    ref.current.rotation.y = t * 0.2 * speed
  })
  return (
    <Float speed={1.4} rotationIntensity={0.6} floatIntensity={1.1}>
      <mesh ref={ref} position={position} scale={scale}>
        <icosahedronGeometry args={[1, 4]} />
        <MeshDistortMaterial
          color={color}
          roughness={0.05}
          metalness={0.4}
          transmission={0.9}
          thickness={1.2}
          transparent
          opacity={0.55}
          distort={0.35}
          speed={1.5}
          ior={1.3}
        />
      </mesh>
    </Float>
  )
}

function Particles({ count = 220 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!)
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 18
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12
      arr[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2
    }
    return arr
  }, [count])

  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.y = state.clock.elapsedTime * 0.02
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.1
  })

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#383eff"
        size={0.035}
        sizeAttenuation
        depthWrite={false}
        opacity={0.8}
      />
    </Points>
  )
}

function Rig() {
  useFrame((state) => {
    // subtle mouse parallax
    const x = state.pointer.x * 0.3
    const y = state.pointer.y * 0.3
    state.camera.position.x += (x - state.camera.position.x) * 0.04
    state.camera.position.y += (y - state.camera.position.y) * 0.04
    state.camera.lookAt(0, 0, 0)
  })
  return null
}

export default function Scene3D() {
  return (
    <Canvas
      dpr={[1, 1.8]}
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} color="#383eff" />
      <directionalLight position={[-5, -3, 2]} intensity={0.8} color="#00d4ff" />
      <pointLight position={[0, 0, 3]} intensity={1.2} color="#0000ff" />

      <GlassKnot position={[-2.6, 0.8, -1]} color="#383eff" scale={1.05} speed={0.8} />
      <GlassKnot position={[2.8, -0.6, -1.5]} color="#00d4ff" scale={0.85} speed={1.1} />
      <GlassKnot position={[0.2, 1.4, -2]} color="#0000ff" scale={0.6} speed={1.3} />
      <GlassKnot position={[1.2, -1.6, 0]} color="#a855f7" scale={0.45} speed={1.5} />

      <Particles />
      <Rig />
    </Canvas>
  )
}
