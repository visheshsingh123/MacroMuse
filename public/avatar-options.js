// Shared allowlist for the picker and authenticated API.
export const AVATAR_OPTIONS = Object.freeze([
  { id:'initial', emoji:null, label:'Your initial', selectable:false },
  { id:'smile', emoji:'😊', label:'Smiling face' },
  { id:'chef', emoji:'🧑‍🍳', label:'Chef', selectable:false },
  { id:'avocado', emoji:'🥑', label:'Avocado' },
  { id:'salad', emoji:'🥗', label:'Salad bowl' },
  { id:'strawberry', emoji:'🍓', label:'Strawberry' },
  { id:'fox', emoji:'🦊', label:'Fox' },
  { id:'cat', emoji:'🐱', label:'Cat' },
  { id:'panda', emoji:'🐼', label:'Panda' },
  { id:'sun', emoji:'☀️', label:'Sunshine' },
  { id:'leaf', emoji:'🌿', label:'Leaf' },
  { id:'star', emoji:'🌟', label:'Glowing star' },
  { id:'rocket', emoji:'🚀', label:'Rocket' },
]);
export const avatarOption = id => AVATAR_OPTIONS.find(option => option.id === id);
