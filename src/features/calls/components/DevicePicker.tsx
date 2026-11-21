import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle, FaInfoCircle, FaMicrophone, FaMicrophoneAlt, FaVideo, FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { LuX } from 'react-icons/lu';
import { useTheme } from '@features/theme';
import { Dropdown, type DropdownOption } from '@components/common/Dropdown';
import { Switch } from '@components/common/Switch';
import { useCall } from '../call-context';
import { useAudioProcessing, useCallVolume, useMicVolume, type AudioProcessing } from '../lib/call-settings';
import { supportsAdvancedNoise } from '../lib/denoiser';
import { MIC_VOLUME_MAX, MIC_VOLUME_MIN } from '../lib/voice-leveler';
import { CALL_VOLUME_MAX, CALL_VOLUME_MIN } from '../lib/voice-playback';
import { listDevicesReliably, supportsVoiceIsolation, type DeviceLists } from '../lib/media-devices';
import type { PresenceStage } from '../lib/presence';
import type { ShareMonitorSupport } from '../lib/share-monitor';
import { isOutside } from './call-hooks';
import { panelTabs, rangeFill, resolveTab, stepTab, toPercent, type PanelTab } from './settings-tabs';
import '../styles/call-panel.css';

export interface SharerSettings {
  movieMode: boolean;
  onMovieMode: (movie: boolean) => void;
  hasAudio: boolean;
  volume: number;
  onVolume: (volume: number) => void;
  previewHidden: boolean;
  onPreviewHidden: (hidden: boolean) => void;
  monitor?: ShareMonitorSupport;
  monitorVolume?: number;
  onMonitorVolume?: (volume: number) => void;
}

export interface ReceiverSettings {
  hasAudio: boolean;
  volume: number;
  onVolume: (volume: number) => void;
}

export interface BroadcastSettings {
  sharer: SharerSettings | null;
  receiver: ReceiverSettings | null;
}

export interface DeviceSelection {
  audioInput: string;
  videoInput: string;
  audioOutput: string;
}

interface DevicePickerProps {
  cameraOn: boolean;
  supportsOutput: boolean;
  selected: DeviceSelection;
  onAudioInput: (deviceId: string) => void;
  onVideoInput: (deviceId: string) => void;
  onAudioOutput: (deviceId: string) => void;
  onClose: (restoreFocus: boolean) => void;
  maxHeight?: number | undefined;
  bottom?: number | undefined;
  trigger?: RefObject<HTMLElement | null>;
  stage?: PresenceStage;
  broadcast?: BroadcastSettings | null | undefined;
}

interface DeviceFieldProps {
  icon: ReactNode;
  label: string;
  hint?: string | undefined;
  emptyLabel: string;
  value: string;
  list: MediaDeviceInfo[];
  defaultLabel: string;
  onChange: (deviceId: string) => void;
}

function DeviceField({ icon, label, hint, emptyLabel, value, list, defaultLabel, onChange }: DeviceFieldProps) {
  const { theme } = useTheme();
  const labelId = useId();
  const known = value === '' || list.some((device) => device.deviceId === value);
  const options: DropdownOption[] =
    list.length === 0
      ? []
      : [{ value: '', label: defaultLabel }, ...list.map((device, index) => ({ value: device.deviceId, label: device.label || `${label} ${index + 1}` }))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: '18px', minWidth: 0, fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.2px', color: theme.textSecondary }}>
      <span id={labelId}>{label}</span>
      <Dropdown value={known ? value : ''} options={options} onChange={onChange} icon={icon} emptyLabel={emptyLabel} labelledBy={labelId} />
      {hint && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: theme.textSecondary, lineHeight: 1.3 }}>{hint}</span>}
    </div>
  );
}

interface AudioOptionProps {
  id: string;
  label: string;
  description: string;
  warning?: string | undefined;
  checked: boolean;
  onChange: () => void;
}

function AudioOption({ id, label, description, warning, checked, onChange }: AudioOptionProps) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span id={id} style={{ fontSize: '0.88rem', fontWeight: 600 }}>
          {label}
        </span>
        <span id={id + '-hint'} style={{ fontSize: '0.74rem', color: theme.textSecondary, lineHeight: 1.3 }}>
          {description}
          {warning && (
            <span className="sc-call-option-warning" data-active={checked}>
              <FaExclamationTriangle size={11} aria-hidden="true" />
              <span>{warning}</span>
            </span>
          )}
        </span>
      </div>
      <Switch checked={checked} onChange={onChange} aria-labelledby={id} aria-describedby={id + '-hint'} />
    </div>
  );
}

interface VolumeOptionProps {
  id: string;
  label: string;
  description: string;
  value: number;
  onChange: (volume: number) => void;
  min?: number;
  max?: number;
  icon?: ReactNode;
}

function VolumeOption({ id, label, description, value, onChange, min = 0, max = 1, icon }: VolumeOptionProps) {
  const { theme } = useTheme();
  const percent = toPercent(value, min, max);
  const minPercent = Math.round(min * 100);
  const maxPercent = Math.round(max * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <span id={id} style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            {label}
          </span>
          <span id={id + '-hint'} style={{ fontSize: '0.74rem', color: theme.textSecondary, lineHeight: 1.3 }}>
            {description}
          </span>
        </div>
        <span className="sc-call-range__value" aria-hidden="true">
          {percent}%
        </span>
      </div>
      <span className="sc-call-range-row">
        <span className="sc-call-range-row__icon" aria-hidden="true">
          {icon ?? (percent === 0 ? <FaVolumeMute size={14} /> : <FaVolumeUp size={14} />)}
        </span>
        <input
          type="range"
          className="sc-call-range"
          min={minPercent}
          max={maxPercent}
          step={1}
          value={percent}
          aria-labelledby={id}
          aria-describedby={id + '-hint'}
          aria-valuetext={`${percent}%`}
          style={{ '--fill': `${rangeFill(percent, minPercent, maxPercent)}%` } as CSSProperties}
          onChange={(event) => onChange(Number(event.target.value) / 100)}
        />
      </span>
    </div>
  );
}

function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="sc-call-panel-note">
      <FaInfoCircle size={13} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function DevicePicker({ cameraOn, supportsOutput, selected, onAudioInput, onVideoInput, onAudioOutput, onClose, maxHeight, bottom, trigger, stage = 'open', broadcast = null }: DevicePickerProps) {
  const { t } = useTranslation();
  const call = useCall();
  const [processing] = useAudioProcessing();
  const [micLevel, setMicLevel] = useMicVolume();
  const [callLevel, setCallLevel] = useCallVolume();
  const voiceIsolation = supportsVoiceIsolation();
  const advancedNoise = supportsAdvancedNoise();
  const [selectedTab, setTab] = useState<PanelTab>('devices');
  const [devices, setDevices] = useState<DeviceLists>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const panelRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const toggle = (key: keyof AudioProcessing) => call.changeAudioProcessing({ [key]: !processing[key] });
  const sharer = broadcast?.sharer ?? null;
  const receiver = broadcast?.receiver ?? null;
  const tabs = panelTabs(sharer !== null || receiver !== null);
  const tab = resolveTab(selectedTab, tabs);

  useEffect(() => {
    if (tab === selectedTab) {
      return;
    }
    setTab(tab);
    if (document.activeElement === null || document.activeElement === document.body) {
      tablistRef.current?.querySelector<HTMLButtonElement>(`[data-tab='${tab}']`)?.focus();
    }
  }, [tab, selectedTab]);

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = stepTab(tabs, tab, event.key);
    if (!next) {
      return;
    }
    event.preventDefault();
    setTab(next);
    tablistRef.current?.querySelector<HTMLButtonElement>(`[data-tab='${next}']`)?.focus();
  };

  const activeTracksRef = useRef<MediaStreamTrack[]>([]);
  activeTracksRef.current = call.snapshot.localStream?.getTracks() ?? [];

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listDevicesReliably({ activeTracks: activeTracksRef.current }).then((result) => {
        if (!cancelled) {
          setDevices(result);
        }
      });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-sc-dropdown]')) {
        return;
      }
      if (isOutside(event.target, panelRef.current, trigger?.current ?? null)) {
        onClose(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !(event.target instanceof Element && event.target.closest('[data-sc-dropdown]'))) {
        event.stopPropagation();
        onClose(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, trigger]);

  const tabLabels: Record<PanelTab, string> = {
    devices: t('calls.tabs.devices'),
    audio: t('calls.tabs.audio'),
    broadcast: t('calls.tabs.broadcast'),
  };

  const tabButton = (id: PanelTab) => (
    <button
      key={id}
      type="button"
      role="tab"
      id={`${titleId}-${id}`}
      data-tab={id}
      aria-selected={tab === id}
      aria-controls={`${titleId}-panel`}
      tabIndex={tab === id ? 0 : -1}
      title={tabLabels[id]}
      onClick={() => setTab(id)}
    >
      {tabLabels[id]}
    </button>
  );

  const sharerSection = sharer && (
    <>
      <AudioOption id="call-share-movie" label={t('calls.broadcast.movie')} description={t('calls.broadcast.movieHint')} checked={sharer.movieMode} onChange={() => sharer.onMovieMode(!sharer.movieMode)} />
      {sharer.hasAudio ? (
        <VolumeOption id="call-share-volume" label={t('calls.broadcast.shareVolume')} description={t('calls.broadcast.shareVolumeHint')} value={sharer.volume} onChange={sharer.onVolume} />
      ) : (
        <PanelNote>{t('calls.broadcast.noShareAudio')}</PanelNote>
      )}
      {sharer.monitor === 'local' && sharer.onMonitorVolume && (
        <div className="sc-call-reveal">
          <VolumeOption id="call-share-monitor" label={t('calls.broadcast.monitorVolume')} description={t('calls.broadcast.monitorVolumeHint')} value={sharer.monitorVolume ?? 1} onChange={sharer.onMonitorVolume} />
        </div>
      )}
      {sharer.monitor === 'unsupported' && (
        <div className="sc-call-reveal">
          <PanelNote>{t('calls.broadcast.monitorUnsupported')}</PanelNote>
        </div>
      )}
      <AudioOption id="call-share-preview" label={t('calls.broadcast.hidePreview')} description={t('calls.broadcast.hidePreviewHint')} checked={sharer.previewHidden} onChange={() => sharer.onPreviewHidden(!sharer.previewHidden)} />
    </>
  );

  const receiverSection = receiver &&
    (receiver.hasAudio ? (
      <VolumeOption id="call-stream-volume" label={t('calls.broadcast.streamVolume')} description={t('calls.broadcast.streamVolumeHint')} value={receiver.volume} onChange={receiver.onVolume} />
    ) : (
      <PanelNote>{t('calls.broadcast.noStreamAudio')}</PanelNote>
    ));

  const tabContent = () => {
    if (tab === 'broadcast') {
      return (
        <div key="broadcast" className="sc-call-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '2px' }}>
          {sharer && receiver ? (
            <>
              <span className="sc-call-panel-section">{t('calls.broadcast.sending')}</span>
              {sharerSection}
              <span className="sc-call-panel-section">{t('calls.broadcast.receiving')}</span>
              {receiverSection}
            </>
          ) : (
            (sharerSection ?? receiverSection)
          )}
        </div>
      );
    }
    if (tab === 'audio') {
      return (
        <div key="audio" className="sc-call-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '2px' }}>
          <span className="sc-call-panel-section">{t('calls.audio.volumeSection')}</span>
          <VolumeOption
            id="call-mic-volume"
            label={t('calls.audio.micVolume')}
            description={t('calls.audio.micVolumeHint')}
            value={micLevel}
            min={MIC_VOLUME_MIN}
            max={MIC_VOLUME_MAX}
            icon={<FaMicrophoneAlt size={14} />}
            onChange={setMicLevel}
          />
          <VolumeOption
            id="call-voice-volume"
            label={t('calls.audio.callVolume')}
            description={t('calls.audio.callVolumeHint')}
            value={callLevel}
            min={CALL_VOLUME_MIN}
            max={CALL_VOLUME_MAX}
            onChange={setCallLevel}
          />
          <span className="sc-call-panel-section">{t('calls.audio.processingSection')}</span>
          <AudioOption id="call-audio-noise" label={t('calls.audio.noise')} description={advancedNoise ? t('calls.audio.noiseAdvancedHint') : t('calls.audio.noiseHint')} checked={processing.noiseSuppression} onChange={() => toggle('noiseSuppression')} />
          <AudioOption id="call-audio-echo" label={t('calls.audio.echo')} description={t('calls.audio.echoHint')} checked={processing.echoCancellation} onChange={() => toggle('echoCancellation')} />
          <AudioOption id="call-audio-gain" label={t('calls.audio.gain')} description={t('calls.audio.gainHint')} checked={processing.autoGainControl} onChange={() => toggle('autoGainControl')} />
          {voiceIsolation && (
            <AudioOption id="call-audio-isolation" label={t('calls.audio.isolation')} description={t('calls.audio.isolationHint')} warning={t('calls.audio.isolationWarning')} checked={processing.voiceIsolation} onChange={() => toggle('voiceIsolation')} />
          )}
        </div>
      );
    }
    return (
      <div key="devices" className="sc-call-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <DeviceField
          icon={<FaMicrophone size={13} />}
          label={t('calls.microphone')}
          emptyLabel={t('calls.noMicrophone')}
          defaultLabel={t('calls.defaultDevice')}
          value={selected.audioInput}
          list={devices.audioInputs}
          onChange={onAudioInput}
        />
        {supportsOutput && (
          <DeviceField
            icon={<FaVolumeUp size={13} />}
            label={t('calls.speaker')}
            emptyLabel={t('calls.noSpeaker')}
            defaultLabel={t('calls.defaultDevice')}
            value={selected.audioOutput}
            list={devices.audioOutputs}
            onChange={onAudioOutput}
          />
        )}
        <DeviceField
          icon={<FaVideo size={13} />}
          label={t('calls.camera')}
          hint={cameraOn ? undefined : t('calls.cameraHint')}
          emptyLabel={t('calls.noCamera')}
          defaultLabel={t('calls.defaultDevice')}
          value={selected.videoInput}
          list={devices.videoInputs}
          onChange={onVideoInput}
        />
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      className="sc-call-panel"
      data-state={stage}
      style={{ ...(maxHeight !== undefined ? { maxHeight: `${maxHeight}px` } : {}), ...(bottom !== undefined ? { bottom: `${bottom}px` } : {}) }}
    >
      <span className="sc-call-panel__handle" aria-hidden="true" />
      <span className="sc-call-panel__caret" aria-hidden="true" />
      <div className="sc-call-panel__head">
        <strong id={titleId} className="sc-call-panel__title">
          {t('calls.settings')}
        </strong>
        <button type="button" className="sc-call-panel__close" onClick={() => onClose(true)} aria-label={t('calls.closeDevices')} title={t('calls.closeDevices')}>
          <LuX size={16} />
        </button>
      </div>
      <div
        ref={tablistRef}
        className="sc-call-segmented"
        role="tablist"
        aria-label={t('calls.settings')}
        onKeyDown={onTabKeyDown}
        style={{ '--tabs': tabs.length, '--tab-index': tabs.indexOf(tab) } as CSSProperties}
      >
        <span className="sc-call-segmented__indicator" data-tab={tab} aria-hidden="true" />
        {tabs.map((id) => tabButton(id))}
      </div>
      <div className="sc-call-panel__body" role="tabpanel" id={`${titleId}-panel`} aria-labelledby={`${titleId}-${tab}`}>
        {tabContent()}
      </div>
    </div>
  );
}
