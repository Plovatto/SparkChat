import type { ComponentProps } from 'react';
import { deferredUntilOpen } from '@lib/lazy/deferred-component';
import type { EditProfileModal as EagerEditProfileModal } from './EditProfileModal';
import type { NewChatModal as EagerNewChatModal } from './NewChatModal';

export const EditProfileModal = deferredUntilOpen<ComponentProps<typeof EagerEditProfileModal>>(() =>
  import('./EditProfileModal').then((module) => module.EditProfileModal),
);

export const NewChatModal = deferredUntilOpen<ComponentProps<typeof EagerNewChatModal>>(() => import('./NewChatModal').then((module) => module.NewChatModal));
