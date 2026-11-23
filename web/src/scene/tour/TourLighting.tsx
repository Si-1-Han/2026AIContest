import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, ToneMapping, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/** 산란광의 흰 베일 없이, 보이는 하늘과 유리 반사에 같은 파랑을 사용한다. */
function makeSky() {
  return new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      horizon: { value: new THREE.Color('#85bce9') },
      middle: { value: new THREE.Color('#4d94dc') },
      zenith: { value: new THREE.Color('#2865bd') },
    },
    vertexShader: `varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // 카메라의 far 값과 무관하게 하늘을 가장 먼 깊이에 둔다.
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `uniform vec3 horizon; uniform vec3 middle; uniform vec3 zenith; varying vec3 skyDirection;
      void main() {
        float height = max(normalize(skyDirection).y, 0.0);
        vec3 color = mix(horizon, middle, smoothstep(0.0, 0.35, height));
        color = mix(color, zenith, smoothstep(0.3, 1.0, height));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
}

export function TourSky() {
  const sky = useMemo(makeSky, []);
  useFrame(({ camera }) => sky.position.copy(camera.position));
  useEffect(() => () => { sky.geometry.dispose(); sky.material.dispose(); }, [sky]);
  return <primitive object={sky} dispose={null} />;
}

export function TourEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const environment = new THREE.Scene();
    const sky = makeSky();
    environment.add(sky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2500, 48), new THREE.MeshBasicMaterial({ color: '#86a66e' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -12; environment.add(ground);
    const pmrem = new THREE.PMREMGenerator(gl); const target = pmrem.fromScene(environment, 0.035, 0.5, 5000);
    const previous = scene.environment, intensity = scene.environmentIntensity;
    scene.environment = target.texture; scene.environmentIntensity = 0.65;
    return () => {
      scene.environment = previous; scene.environmentIntensity = intensity;
      target.dispose(); pmrem.dispose(); sky.geometry.dispose(); sky.material.dispose(); ground.geometry.dispose(); ground.material.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function TourEffects() {
  return <EffectComposer multisampling={2}>
    {/* Composer는 renderer의 톤 매핑을 끄므로 HDR 조명 뒤에 명시적으로 복원한다. */}
    <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    <HueSaturation saturation={0.04} />
    <BrightnessContrast brightness={0} contrast={0.065} />
  </EffectComposer>;
}
