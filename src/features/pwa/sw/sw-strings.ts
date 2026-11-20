export interface WorkerStrings {
  incomingCall: string;
  voiceCallBody: string;
  videoCallBody: string;
  answer: string;
  decline: string;
  missedCall: string;
  missedCallBody: string;
  newMessage: string;
  newMessageBody: string;
  generic: string;
  genericBody: string;
  photo: string;
  audio: string;
  file: string;
}

export const WORKER_STRINGS: Record<'pt' | 'en', WorkerStrings> = {
  pt: {
    incomingCall: 'Chamada recebida',
    voiceCallBody: 'Chamada de voz no SparkChat',
    videoCallBody: 'Chamada de vídeo no SparkChat',
    answer: 'Atender',
    decline: 'Recusar',
    missedCall: 'Chamada perdida',
    missedCallBody: 'Você perdeu uma chamada no SparkChat',
    newMessage: 'Nova mensagem',
    newMessageBody: 'Abra o SparkChat para ler',
    generic: 'SparkChat',
    genericBody: 'Você tem uma novidade no SparkChat',
    photo: '📷 Foto',
    audio: '🎤 Áudio',
    file: '📎 Arquivo',
  },
  en: {
    incomingCall: 'Incoming call',
    voiceCallBody: 'Voice call on SparkChat',
    videoCallBody: 'Video call on SparkChat',
    answer: 'Answer',
    decline: 'Decline',
    missedCall: 'Missed call',
    missedCallBody: 'You missed a call on SparkChat',
    newMessage: 'New message',
    newMessageBody: 'Open SparkChat to read it',
    generic: 'SparkChat',
    genericBody: 'Something new on SparkChat',
    photo: '📷 Photo',
    audio: '🎤 Audio',
    file: '📎 File',
  },
};
