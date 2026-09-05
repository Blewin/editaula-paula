/** 100 bird names used as whimsical default titles for new documents. */
export const BIRDS = [
  "Albatross", "Avocet", "Bee-eater", "Bittern", "Blackbird", "Blackcap",
  "Bluethroat", "Bobolink", "Brambling", "Bufflehead", "Bullfinch", "Bunting",
  "Bushtit", "Canary", "Capercaillie", "Cardinal", "Chaffinch", "Chickadee",
  "Chiffchaff", "Chough", "Cockatiel", "Condor", "Coot", "Cormorant",
  "Corncrake", "Crane", "Crossbill", "Cuckoo", "Curlew", "Dipper",
  "Dotterel", "Dunlin", "Dunnock", "Eagle", "Egret", "Eider",
  "Falcon", "Fieldfare", "Finch", "Firecrest", "Flamingo", "Flycatcher",
  "Frigatebird", "Fulmar", "Gadwall", "Gannet", "Godwit", "Goldcrest",
  "Goldeneye", "Goldfinch", "Goosander", "Goshawk", "Grebe", "Greenfinch",
  "Grosbeak", "Guillemot", "Gyrfalcon", "Harrier", "Hawfinch", "Heron",
  "Hobby", "Hoopoe", "Ibis", "Jacana", "Jackdaw", "Jay",
  "Junco", "Kestrel", "Killdeer", "Kingfisher", "Kinglet", "Kite",
  "Kittiwake", "Lapwing", "Lark", "Linnet", "Magpie", "Mallard",
  "Merlin", "Nightingale", "Nightjar", "Nuthatch", "Oriole", "Osprey",
  "Ouzel", "Owlet", "Oystercatcher", "Partridge", "Peregrine", "Petrel",
  "Pintail", "Pipit", "Plover", "Pochard", "Puffin", "Quail",
  "Redstart", "Robin", "Sanderling", "Skylark",
] as const;

export function randomBirdName(): string {
  return BIRDS[Math.floor(Math.random() * BIRDS.length)];
}
