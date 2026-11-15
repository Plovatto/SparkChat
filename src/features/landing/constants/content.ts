import type { IconType } from 'react-icons';
import { FaBell, FaBolt, FaLock, FaPalette, FaPaperclip, FaRobot } from 'react-icons/fa';

export const APP_URL = '/app/';

export interface Feature {
  icon: IconType;
  title: string;
  text: string;
}

export const FEATURES: Feature[] = [
  {
    icon: FaBolt,
    title: 'Mensagens na hora',
    text: 'As mensagens chegam em tempo real, e a conexão se refaz sozinha quando a internet oscila.',
  },
  {
    icon: FaLock,
    title: 'Criptografia ponta a ponta',
    text: 'Textos e anexos são cifrados no seu navegador antes de sair do aparelho.',
  },
  {
    icon: FaPaperclip,
    title: 'Fotos, áudios e arquivos',
    text: 'Envie imagens, grave áudios e compartilhe PDFs com pré-visualização dentro da conversa.',
  },
  {
    icon: FaRobot,
    title: 'Assistente SparkAI',
    text: 'Um assistente fixado na sua lista de conversas para tirar dúvidas ou só trocar ideia.',
  },
  {
    icon: FaPalette,
    title: 'Do seu jeito',
    text: 'Cores, papéis de parede e aparência dos balões acompanham você em todos os aparelhos.',
  },
  {
    icon: FaBell,
    title: 'Avisos no momento certo',
    text: 'Notificações do navegador, sons e o contador de não lidas direto na aba.',
  },
];
export interface SecurityStep {
  title: string;
  text: string;
}

export const SECURITY_STEPS: SecurityStep[] = [
  {
    title: 'Suas chaves nascem no seu aparelho',
    text: 'Ao criar a conta, o navegador gera o seu par de chaves. A chave privada só sai dali protegida pela sua senha.',
  },
  {
    title: 'Cada mensagem é cifrada antes do envio',
    text: 'Textos, fotos, áudios e arquivos viajam embaralhados, do seu navegador até o destino.',
  },
  {
    title: 'O servidor só entrega',
    text: 'Ele guarda e repassa o conteúdo cifrado, sem conseguir ler o que foi escrito.',
  },
  {
    title: 'Quem participa da conversa lê',
    text: 'A mensagem só volta a ser legível no aparelho de quem está na conversa.',
  },
];

export interface Screenshot {
  name: 'chat-assistente' | 'chat-desktop' | 'chat-arquivo';
  alt: string;
  caption: string;
}

export const SCREENSHOTS: Screenshot[] = [
  {
    name: 'chat-assistente',
    alt: 'Conversa com o assistente SparkAI no tema vermelho, com uma resposta citada e as ações Responder e Encaminhar',
    caption: 'Conversa com o SparkAI, com respostas citadas e ações rápidas',
  },
  {
    name: 'chat-desktop',
    alt: 'Conversa com Marina no tema roxo, com mensagem de áudio e uma foto de paisagem enviada',
    caption: 'Áudios e fotos sobre um papel de parede de águas-vivas',
  },
  {
    name: 'chat-arquivo',
    alt: 'Conversa sobre uma viagem no tema rosa e verde, com um PDF pré-visualizado e uma resposta citando o arquivo',
    caption: 'PDF com pré-visualização e resposta citando o arquivo',
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ: FaqItem[] = [
  {
    question: 'O SparkChat é gratuito?',
    answer: 'Sim. Para criar a conta basta escolher um avatar, um nome de usuário e uma senha, sem cartão e sem período de teste.',
  },
  {
    question: 'Preciso instalar alguma coisa?',
    answer: 'Não. O SparkChat funciona no navegador, no computador ou no celular. Se quiser, dá para adicioná-lo à tela inicial.',
  },
  {
    question: 'Como funciona a criptografia?',
    answer:
      'As mensagens e os anexos são cifrados no seu navegador com chaves que só os participantes da conversa conseguem usar. O servidor entrega o conteúdo, mas não consegue lê-lo.',
  },
  {
    question: 'O que é o arquivo de recuperação?',
    answer:
      'É um arquivo gerado na criação da conta que permite entrar em outro aparelho sem perder o histórico cifrado. Guarde-o em um lugar seguro: sem ele e sem a senha, não há como recuperar as mensagens.',
  },
  {
    question: 'As conversas com o SparkAI também são cifradas?',
    answer:
      'Para responder, o assistente precisa ler o que você escreve, então essas mensagens são processadas pelo servidor e pelo modelo de IA. As conversas entre pessoas continuam cifradas de ponta a ponta.',
  },
  {
    question: 'O tema que eu escolho aqui vale no app?',
    answer:
      'O modo claro ou escuro escolhido aqui já vale na tela de entrada. Dentro do app, você escolhe cor, modo e papel de parede no menu de aparência, e a escolha acompanha sua conta em todos os aparelhos.',
  },
];

export const LINKS = {
  repository: 'https://github.com/Plovatto/SparkChat',
  apiRepository: 'https://github.com/Plovatto/API-SparkChat',
  apiDocs: 'https://sparkchat-api.plovatto.dev/docs/',
  portfolio: 'https://plovatto.dev/',
  license: 'https://github.com/Plovatto/SparkChat/blob/main/LICENSE',
};
