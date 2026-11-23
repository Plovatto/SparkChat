import type { ComponentProps } from 'react';
import { deferredComponent } from '@lib/lazy/deferred-component';
import type { GifPanel as EagerGifPanel } from './GifPanel';

export const GifPanel = deferredComponent<ComponentProps<typeof EagerGifPanel>>(() => import('./GifPanel').then((module) => module.GifPanel));
