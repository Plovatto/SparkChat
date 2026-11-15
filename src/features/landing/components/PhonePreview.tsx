import { FaArrowLeft, FaMicrophone, FaPaperclip } from 'react-icons/fa';
import { DemoAvatar } from './DemoAvatar';

interface PhonePreviewProps {
  wallpaper: string | null;
  colorName: string;
  modePhrase: string;
}

export function PhonePreview({ wallpaper, colorName, modePhrase }: PhonePreviewProps) {
  return (
    <div className="lp-phone" role="img" aria-label={`Prévia no celular de uma conversa com o SparkAI usando a cor ${colorName} ${modePhrase}`}>
      <div className="lp-phone__screen" aria-hidden="true">
        <div className="lp-phone__header">
          <span className="lp-window__round">
            <FaArrowLeft size={11} />
          </span>
          <DemoAvatar name="Robot" size={34} online />
          <div className="lp-window__chat-title">
            <strong>SparkAI</strong>
            <span>100% pilha, 0% sono</span>
          </div>
        </div>

        <div className="lp-phone__messages" style={wallpaper ? { background: wallpaper, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          <div className="lp-bubble" data-own="false">
            Oi! Eu sou o SparkAI. Apareci aqui só pra gente trocar ideia, manda o que quiser!
            <span className="lp-bubble__meta">09:41</span>
          </div>
          <div className="lp-bubble" data-own="true">
            Me ajuda a escolher a cor do meu chat?
            <span className="lp-bubble__meta">09:42</span>
          </div>
          <div className="lp-bubble" data-own="false">
            {`Que tal a cor ${colorName} ${modePhrase}? Ficou a sua cara 😄`}
            <span className="lp-bubble__meta">09:42</span>
          </div>
        </div>

        <div className="lp-window__composer">
          <span className="lp-window__round lp-window__round--soft">
            <FaPaperclip size={11} />
          </span>
          <span className="lp-window__round lp-window__round--soft">
            <FaMicrophone size={11} />
          </span>
          <span className="lp-window__input">Mensagem</span>
        </div>
      </div>
    </div>
  );
}
