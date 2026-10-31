// Stages (scenes). Each stage is a script JSON with its own actors, lines and blocking (movement).
export const STAGES = [
  { id: 1, tag: 'STAGE 1', title: '上京前夜', desc: '2人芝居。基本：口元を狙う・画角に入らない・影を落とさない。', script: './script.json' },
  { id: 2, tag: 'STAGE 2', title: '上京の朝', desc: '3人芝居。役者が動く。交互に話さないフェイント。雑音源に注意。', script: './script_s2.json' },
];
export const DIRECTOR_URL = './director.json';
export const PRESENTER_URL = './presenter.json';
