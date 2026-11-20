import { describe, expect, it } from 'vitest';
import { prepareDenoiser, supportsAdvancedNoise, type DenoiseNodeLike } from './denoiser';

const node = (): DenoiseNodeLike => ({ connect: () => undefined, disconnect: () => undefined, port: { postMessage: () => undefined, onmessage: null } });

function worklet() {
  const modules: string[] = [];
  return { modules, audioWorklet: { addModule: (url: string) => Promise.resolve(void modules.push(url)) } };
}

describe('prepareDenoiser', () => {
  it('loads the worklet and the model once per context and builds nodes with the model bytes', async () => {
    const { modules, audioWorklet } = worklet();
    const context = { sampleRate: 48_000, audioWorklet };
    const wasm = new ArrayBuffer(8);
    const created: ArrayBuffer[] = [];
    let fetched = 0;
    const deps = {
      workletUrl: () => Promise.resolve('/assets/denoise.js'),
      wasmBytes: () => {
        fetched += 1;
        return Promise.resolve(wasm);
      },
      createNode: (_context: unknown, bytes: ArrayBuffer) => {
        created.push(bytes);
        return node();
      },
    };

    const factory = await prepareDenoiser(context, deps);
    await prepareDenoiser(context, deps);
    factory?.();

    expect(modules).toEqual(['/assets/denoise.js']);
    expect(fetched).toBe(1);
    expect(created).toEqual([wasm]);
  });

  it('gives up without AudioWorklet, at other sample rates or when loading fails', async () => {
    const deps = { workletUrl: () => Promise.resolve('/w.js'), wasmBytes: () => Promise.resolve(new ArrayBuffer(1)), createNode: node };

    expect(await prepareDenoiser({ sampleRate: 48_000 }, deps)).toBeNull();
    expect(await prepareDenoiser({ sampleRate: 44_100, audioWorklet: worklet().audioWorklet }, deps)).toBeNull();
    expect(await prepareDenoiser({ sampleRate: 48_000, audioWorklet: worklet().audioWorklet }, { ...deps, wasmBytes: () => Promise.reject(new Error('offline')) })).toBeNull();
  });

  it('reports no support outside the browser', () => {
    expect(supportsAdvancedNoise()).toBe(false);
  });
});
