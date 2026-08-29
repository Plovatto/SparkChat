export interface RoomThemePalette {
  sidebarBg: string;
  surface: string;
  surfaceLight: string;
  border: string;
  text: string;
  textSecondary: string;
  headerGradient: string;
  headerTextColor: string;
  primary: string;
  background: string;
}

export const DEFAULT_ROOM_THEME: RoomThemePalette = {
  sidebarBg: '#2f3136',
  surface: '#2f3136',
  surfaceLight: '#40444b',
  border: '#202225',
  text: '#f0f0f0',
  textSecondary: '#b0b0b0',
  headerGradient: 'linear-gradient(130deg, #516ce4 0%, #7e37b9 100%)',
  headerTextColor: '#ffffff',
  primary: '#516ce4',
  background: '#36393f',
};
