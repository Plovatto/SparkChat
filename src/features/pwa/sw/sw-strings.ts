export interface WorkerStrings {
  incomingCall: string;
  voiceCallBody: string;
  videoCallBody: string;
  answer: string;
  decline: string;
  missedCall: string;
  missedCallBody: string;
  callEnded: string;
  callEndedBody: string;
  newMessage: string;
  newMessageBody: string;
  generic: string;
  genericBody: string;
  photo: string;
  audio: string;
  file: string;
  reminderTitle: string;
  reminderBodyFallback: string;
  reminderDone: string;
  reminderSnooze10: string;
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
    callEnded: 'Chamada encerrada',
    callEndedBody: 'Esta chamada já terminou',
    newMessage: 'Nova mensagem',
    newMessageBody: 'Abra o SparkChat para ler',
    generic: 'SparkChat',
    genericBody: 'Você tem uma novidade no SparkChat',
    photo: '📷 Foto',
    audio: '🎤 Áudio',
    file: '📎 Arquivo',
    reminderTitle: '⏰ Lembrete',
    reminderBodyFallback: 'Você tem um lembrete do SparkAI',
    reminderDone: 'Concluído',
    reminderSnooze10: 'Adiar 10 min',
  },
  en: {
    incomingCall: 'Incoming call',
    voiceCallBody: 'Voice call on SparkChat',
    videoCallBody: 'Video call on SparkChat',
    answer: 'Answer',
    decline: 'Decline',
    missedCall: 'Missed call',
    missedCallBody: 'You missed a call on SparkChat',
    callEnded: 'Call ended',
    callEndedBody: 'This call has already ended',
    newMessage: 'New message',
    newMessageBody: 'Open SparkChat to read it',
    generic: 'SparkChat',
    genericBody: 'Something new on SparkChat',
    photo: '📷 Photo',
    audio: '🎤 Audio',
    file: '📎 File',
    reminderTitle: '⏰ Reminder',
    reminderBodyFallback: 'You have a reminder from SparkAI',
    reminderDone: 'Done',
    reminderSnooze10: 'Snooze 10 min',
  },
};
