import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

/** 포스트프로세싱. 저사양 PC 대응 품질 프리셋은 M4에서 추가 */
export function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.75} luminanceSmoothing={0.2} />
      <Vignette offset={0.2} darkness={0.75} />
    </EffectComposer>
  );
}
