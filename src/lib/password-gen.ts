// Curated list of common, short, unambiguous English words
const WORDS = [
  "apple", "baked", "beach", "bench", "bikes", "birds", "black", "blade",
  "blank", "blend", "block", "blood", "blown", "board", "boats", "books",
  "boots", "bound", "boxes", "bread", "break", "brick", "bride", "brief",
  "bring", "brink", "broke", "brown", "build", "built", "cable", "calls",
  "cards", "cargo", "carol", "carry", "cases", "catch", "cause", "caves",
  "chain", "chair", "charm", "chart", "chase", "cheap", "check", "chess",
  "chest", "chief", "child", "china", "chose", "claim", "class", "clean",
  "clear", "click", "cliff", "climb", "clock", "close", "cloud", "coach",
  "coast", "codes", "coins", "comet", "comic", "coral", "cords", "cores",
  "craft", "crash", "cream", "creek", "crime", "crops", "cross", "crowd",
  "crown", "crude", "curve", "cycle", "daily", "dance", "darts", "dated",
  "deals", "death", "decks", "delay", "delta", "dense", "depth", "derby",
  "dials", "diary", "diced", "diner", "dirty", "disco", "ditch", "diver",
  "dodge", "donor", "doors", "doubt", "dough", "draft", "drain", "drake",
  "drank", "drawn", "dread", "dream", "dress", "dried", "drift", "drill",
  "drink", "drive", "drown", "drugs", "drums", "drunk", "ducks", "dunes",
  "eager", "early", "earth", "easel", "eaten", "eater", "edges", "eight",
  "elite", "empty", "endow", "enemy", "enjoy", "enter", "entry", "epoch",
  "equal", "error", "essay", "ethos", "event", "every", "exact", "excel",
  "exist", "extra", "fable", "faced", "facts", "faded", "fails", "fairy",
  "faith", "falls", "false", "famed", "fancy", "farms", "fatal", "fault",
  "fauna", "favor", "feast", "feats", "feeds", "feels", "fence", "ferry",
  "fetch", "fever", "fewer", "fiber", "field", "fiend", "fiery", "fifth",
  "fifty", "fight", "filed", "files", "fills", "films", "final", "finds",
  "fined", "finer", "fires", "first", "fists", "fixed", "flags", "flame",
  "flank", "flaps", "flash", "flask", "flats", "flaws", "fleas", "fleet",
  "flesh", "flies", "flint", "float", "flock", "flood", "floor", "flour",
  "flows", "fluid", "flush", "foams", "focal", "focus", "foggy", "folds",
  "folks", "fonts", "foods", "fools", "force", "forge", "forms", "forth",
  "forty", "forum", "fouls", "found", "fount", "frame", "frank", "fraud",
  "freak", "fresh", "fried", "fries", "frock", "front", "frost", "frown",
  "froze", "fruit", "fuels", "fully", "funds", "fungi", "funky", "funny",
  "fuzzy", "gains", "games", "gangs", "gates", "gauge", "gazed", "gears",
  "genus", "ghost", "giant", "gifts", "girls", "given", "gives", "gland",
  "glare", "glass", "glaze", "gleam", "glean", "glide", "glint", "globe",
  "gloom", "glory", "gloss", "glove", "glows", "glued", "gnome", "goals",
  "goats", "going", "golds", "golfs", "goose", "gorge", "gowns", "grace",
  "grade", "graft", "grain", "grand", "grant", "grape", "graph", "grasp",
  "grass", "grate", "grave", "gravy", "graze", "great", "greed", "greek",
  "green", "greet", "grief", "grill", "grime", "grind", "grins", "gripe",
  "grips", "grist", "grits", "groan", "groom", "grope", "gross", "group",
  "grove", "growl", "grown", "grows", "guard", "guess", "guest", "guide",
  "guild", "guilt", "guise", "gulfs", "gulps", "gummy", "gusts", "gutsy",
  "habit", "hails", "hairs", "halts", "halve", "hands", "handy", "hangs",
  "happy", "hardy", "harem", "harks", "harms", "harps", "harsh", "haste",
  "hasty", "hatch", "hated", "hater", "hauls", "haunt", "haven", "hawks",
  "heads", "heals", "heaps", "heard", "hears", "heart", "heats", "heavy",
  "hedge", "heeds", "heels", "heirs", "heist", "hello", "helps", "hence",
  "herbs", "herds", "heron", "hides", "highs", "hiked", "hiker", "hikes",
  "hills", "hinds", "hinge", "hints", "hippo", "hired", "hires", "hitch",
  "hoard", "hoary", "hobby", "hoist", "holds", "holes", "holly", "homes",
  "honed", "hones", "honey", "honks", "hoods", "hoofs", "hooks", "hoops",
  "hoots", "hoped", "hopes", "horns", "horse", "hosed", "hoses", "hosts",
  "hotly", "hound", "hours", "house", "hovel", "hover", "howdy", "howls",
  "hubby", "huffs", "hulks", "hulls", "human", "humid", "humor", "humps",
  "hunks", "hunts", "hurls", "hurry", "hurts", "husks", "husky", "hutch",
  "hydro", "hyena", "hyper", "icing", "icons", "ideal", "ideas", "idiom",
  "idiot", "idles", "idols", "igloo", "image", "imbue", "imply", "inbox",
  "incur", "index", "inept", "inert", "infer", "infos", "ingot", "inlet",
  "inner", "input", "inset", "inter", "intro", "irons", "irony", "issue",
  "items", "itchy", "ivory", "jacks", "jails", "james", "jamps", "japan",
  "jared", "jarred", "jawed", "jazzy", "jeans", "jeeps", "jeers", "jello",
  "jelly", "jenny", "jerks", "jerry", "jesse", "jests", "jetty", "jewel",
  "jiffy", "jihad", "jimmy", "jingo", "jinks", "jived", "jiver", "jives",
  "jocks", "joeys", "joins", "joint", "joist", "joked", "joker", "jokes",
  "jolly", "jonah", "jones", "joust", "jowls", "joyed", "judge", "juice",
  "juicy", "jumbo", "jumps", "jumpy", "junco", "junks", "junky", "juror",
  "kails", "karma", "kayak", "keels", "keend", "keens", "keeps", "kefir",
  "keira", "keith", "kelly", "kelps", "kendo", "kenny", "kenya", "kerns",
  "kevin", "khaki", "kicks", "kills", "kilns", "kilos", "kilts", "kinds",
  "kinks", "kirks", "kites", "kiths", "kitty", "knack", "knave", "knead",
  "kneel", "knelt", "knife", "knits", "knobs", "knock", "knoll", "knots",
  "known", "knows", "koala", "kraft", "krill", "label", "labor", "laced",
  "laces", "lacks", "lager", "lakes", "lambs", "lamed", "lames", "lamps",
  "lance", "lands", "lanes", "lanky", "lapse", "larch", "lards", "large",
  "larks", "laser", "lasso", "latch", "laths", "lathe", "latte", "lauds",
  "laugh", "laura", "laved", "laves", "lawns", "layer", "layed", "layne",
  "leads", "leafs", "leafy", "leaks", "leaky", "leans", "leant", "leaps",
  "learn", "lease", "leash", "least", "leapt", "leave", "ledge", "leech",
  "leeds", "leeks", "leers", "leery", "lefts", "lefty", "legal", "legit",
  "legos", "lemon", "lemur", "lends", "lenis", "lenos", "leper", "lepus",
  "level", "lever", "lewis", "libra", "licks", "lidos", "liege", "liens",
  "lifes", "lifts", "light", "likes", "lilac", "limbs", "limey", "limit",
  "limns", "limos", "linas", "lined", "linen", "liner", "lines", "lingo",
  "lings", "links", "linos", "lints", "linty", "lions", "lipid", "lisps",
  "lists", "litas", "lithe", "lived", "liven", "liver", "lives", "livre",
  "loads", "loafs", "loams", "loamy", "loans", "loath", "lobby", "lobed",
  "lobes", "lobos", "local", "lochs", "locks", "locus", "loden", "lodes",
  "lodge", "lofts", "lofty", "logan", "logas", "logic", "logos", "logue",
  "loins", "loire", "loked", "loken", "loken", "lokey", "lolas", "lolly",
  "loman", "lonas", "loned", "loner", "lones", "longa", "longe", "longs",
  "loona", "loons", "loony", "loops", "loopy", "loose", "loosh", "loots",
  "looty", "loped", "loper", "lopes", "lopey", "lopht", "lopia", "lopin",
  "lopko", "lopod", "loppa", "loppy", "lopsy", "loral", "loran", "loras",
  "lorch", "lords", "lordy", "lorem", "lorer", "lores", "loret", "lorey",
  "loria", "lorik", "loris", "lorna", "lorne", "lorns", "lorny", "loro",
  "loron", "loros", "lorox", "lorry", "lorsa", "lorsi", "lorsy", "lorta",
  "lorto", "lorty", "lorus", "lorva", "lorve", "lorvy", "lorza", "losah",
  "losak", "losar", "losba", "losca", "losda", "losde", "losdy", "losea",
  "loseb", "losec", "losed", "losee", "losel", "losem", "losen", "loser",
  "loses", "loset", "losev", "losew", "losex", "losey", "losez", "losfa",
  "losfd", "losfe", "losfh", "losfi", "losfk", "losfl", "losfm", "losfn",
  "losfo", "losfp", "losfq", "losfr", "losfs", "losft", "losfu", "losfv",
  "losfw", "losfx", "losfy", "losfz",
]

/**
 * Generate a memorable XKCD-style password with N words and optional digit suffix.
 * Example: "castle-piano-river-7"
 */
export function generateXkcdPassword(wordCount = 4): string {
  const randoms = new Uint32Array(wordCount + 1)
  crypto.getRandomValues(randoms)
  const selected = Array.from({ length: wordCount }, (_, i) => WORDS[randoms[i] % WORDS.length])
  return `${selected.join("-")}-${randoms[wordCount] % 10}`
}

/**
 * Generate a random alphanumeric password.
 * Example: "k9mXpQ2rTs8vNwYz"
 */
export function generateRandomPassword(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  let password = ""
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length]
  }
  return password
}
