import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

/** 포스트프로세싱. 저사양 PC 대응 품질 프리셋은 M4에서 추가 */
export function Effects() {
  return (
    <EffectComposer multisampling={4}>
      {/* 밝은 배경이라 문턱을 높여 경로·마커처럼 빛나는 것만 번지게 한다 */}
      <Bloom mipmapBlur intensity={0.45} luminanceThreshold={0.95} luminanceSmoothing={0.1} />
      <Vignette offset={0.3} darkness={0.35} />
    </EffectComposer>
  );
}
