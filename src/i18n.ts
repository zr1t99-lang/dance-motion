/** Tiny UI translation layer: English strings are the keys; Arabic is looked up at render time. */
export type Lang = "en" | "ar";
let current: Lang = "en";
export const getLang = () => current;
export const setLang = (l: Lang) => {
  current = l;
  try {
    document.documentElement.lang = l;
  } catch {
    /* no DOM */
  }
};
export const isAr = () => current === "ar";

const AR: Record<string, string> = {
  // menu
  "DANCE COPY": "قلّد الرقصة",
  "DANCE CONTROL": "تحكّم بالرقصة",
  "MOTION MIRROR": "مرآة الحركة",
  "Copy the dancer to an original song. Scored on joint angles, position and timing.": "قلّد الراقصين على أغنية أصلية. التقييم حسب زوايا المفاصل والموضع والتوقيت.",
  "You drive the dancer with your real moves, on the beat. Private 60 s test (needs your own audio file).": "أنتِ تتحكمين بالشخصية بحركاتك الحقيقية على الإيقاع. اختبار خاص 60 ثانية (يحتاج ملف الصوت عندك).",
  "A 3D avatar that mirrors your body live from the camera. No pre-made animation.": "شخصية تقلّد جسمك مباشرة من الكاميرا. بدون حركات جاهزة.",
  "Real camera body-tracking · prototype · ": "تتبّع الجسم بالكاميرا · نسخة تجريبية · ",
  "⚙ Settings": "⚙ الإعدادات",
  "📺 TV Mode": "📺 وضع التلفزيون",
  "⛶ Fullscreen": "⛶ ملء الشاشة",
  "The camera only starts after you tap a mode. Video never leaves your device: pose detection runs locally in the browser.": "الكاميرا ما تشتغل إلا بعد ما تختارين وضع. الفيديو ما يطلع من جهازك: التعرّف على الجسم يتم داخل المتصفح.",
  "This page is not served over HTTPS, so the browser will block the camera. Open it via HTTPS or http://localhost (see README).": "هذي الصفحة مو على HTTPS، فالمتصفح بيمنع الكاميرا. افتحيها عبر HTTPS.",
  // loading / errors
  "Requesting camera…": "جاري طلب الكاميرا…",
  "First start downloads the pose model (a few MB). Needs an internet connection.": "أول تشغيل يحمّل نموذج التعرّف على الجسم (بضع ميجابايت). يحتاج إنترنت.",
  "Try again": "حاول مرة ثانية",
  "Back": "رجوع",
  "Camera permission denied": "تم رفض إذن الكاميرا",
  "No camera found": "ما لقيت كاميرا",
  "HTTPS required": "يلزم HTTPS",
  "Camera unavailable": "الكاميرا غير متاحة",
  "Camera not supported": "الكاميرا غير مدعومة",
  "Camera problem": "مشكلة في الكاميرا",
  "Pose model failed to load": "فشل تحميل نموذج التعرّف على الجسم",
  "Something went wrong": "صار خطأ",
  "Tap the lock / site-settings icon in the address bar → Camera → Allow, then press Try again.": "اضغطي على أيقونة القفل / إعدادات الموقع في شريط العنوان ← الكاميرا ← سماح، ثم اضغطي حاول مرة ثانية.",
  "On iOS: Settings → Safari → Camera → Ask or Allow.": "على آيفون/آيباد: الإعدادات ← Safari ← الكاميرا ← اسأل أو اسمح.",
  "Close other apps/tabs that may be using the camera (video calls, camera apps), then Try again.": "أغلقي التطبيقات أو التبويبات الثانية اللي تستخدم الكاميرا (مكالمات فيديو أو الكاميرا)، ثم حاولي مرة ثانية.",
  "Check your connection and try again.": "تأكدي من الاتصال بالإنترنت وحاولي مرة ثانية.",
  // calibration
  "CALIBRATION": "المعايرة",
  "Stand back until your entire body is visible.": "ابتعدي لين يبان جسمك كامل.",
  "No body detected yet. ": "ما تم اكتشاف جسم للحين. ",
  "Step back: your knees / feet are not fully in view.": "ابتعدي شوي: الركبتين والقدمين مو واضحين.",
  "Make sure your arms are in view and not hidden.": "تأكدي إن ذراعيك ظاهرتين وغير مخفيتين.",
  "Hold still…": "اثبتي…",
  "Head": "الرأس", "Shoulders": "الكتفين", "Elbows": "المرفقين", "Wrists": "الرسغين", "Hips": "الوركين", "Knees": "الركبتين", "Ankles": "الكاحلين",
  "⟲ Switch camera": "⟲ بدّل الكاميرا",
  "Landmarks must be detected with confidence and inside the frame. Nothing is skipped or simulated.": "لازم تنكشف نقاط الجسم بثقة وداخل الإطار. ما فيه شي يتم تخطيه أو تزييفه.",
  "NO BODY DETECTED": "ما تم اكتشاف جسم",
  "Camera": "الكاميرا",
  "You": "أنتِ",
  // HUD / toolbar
  "SCORE": "النقاط", "Accuracy": "الدقة", "Combo": "الكومبو", "Coming up": "الحركة الجاية",
  "PERFECT": "ممتاز", "GREAT": "رائع", "GOOD": "جيد", "MISS": "فاتت", "KEEP": "كمّلي", "PERFECT!": "ممتاز!", "AMAZING!": "مذهل!", "GREAT!": "رائع!", "GOOD!": "جيد!", "NICE MOVE!": "حركة حلوة!", "KEEP GOING!": "كمّلي!", "YOU GOT THIS!": "تقدرين!",
  "YOU ▼": "أنتِ ▼", "COPY ME ▼": "قلّديني ▼",
  "❚❚ Pause": "❚❚ إيقاف مؤقت", "▶ Play": "▶ تشغيل", "↻ Restart": "↻ من البداية", "⟲ Camera": "⟲ الكاميرا", "Debug": "Debug", "✕ Exit": "✕ خروج",
  "Mirror: On": "المرآة: تشغيل", "Mirror: Off": "المرآة: إيقاف",
  "TRACKING LOST": "فقدنا التتبّع",
  "GO!": "يلا!",
  "Finished": "انتهت", "Last move": "آخر حركة",
  "Step into view: waiting for your body to be detected…": "ادخلي في الإطار: بانتظار اكتشاف جسمك…",
  "Paused": "إيقاف مؤقت", "Resume": "كمّلي", "Restart": "من البداية", "Quit": "خروج",
  "Dance Copy": "قلّد الرقصة", "Dance Control": "تحكّم بالرقصة",
  "Neutral": "وضع عادي",
  // sections
  "Video intro (no dancing)": "مقدمة الفيديو (بدون رقص)", "Dance": "رقص",
  "Intro": "مقدمة", "Verse 1": "المقطع 1", "Verse 2": "المقطع 2", "Pre-Chorus": "ما قبل الكورس", "Chorus": "الكورس", "Bridge": "الجسر", "Final Chorus": "الكورس الأخير", "Outro": "الخاتمة", "Routine": "الروتين",
  // songs
  "Dance Motion Originals": "أغاني أصلية للعبة", "Practice beat": "إيقاع للتدريب",
  "30 s Test Routine": "روتين اختبار 30 ثانية",
  "128 BPM · 1:49 · each move held ~2 s, repeated": "128 نبضة/د · 1:49 · كل حركة تثبت ~2 ثانية وتتكرر",
  "9 moves · 120 BPM click · quick check": "9 حركات · 120 نبضة/د · فحص سريع",
  "Soda Pop · Control": "Soda Pop · تحكّم",
  "Private reference video — local test only": "فيديو مرجعي خاص — اختبار محلي فقط",
  "126 BPM · first 60 s · you move, the dancer follows YOU": "126 نبضة/د · أول 60 ثانية · أنتِ تتحركين والشخصية تتبعك",
  // pose names
  "Arms out wide": "الذراعين للجانبين", "Cactus arms": "ذراعين مثل الصبار", "Point right": "أشيري لليمين", "Point left": "أشيري لليسار",
  "Sky punch right": "ضربة للسماء باليمين", "Sky punch left": "ضربة للسماء باليسار", "Both hands up": "اليدين للأعلى", "Overhead clap": "تصفيق فوق الراس",
  "V arms": "ذراعين على شكل V", "Hands on hips": "اليدين على الخصر", "Disco point right": "ديسكو لليمين", "Disco point left": "ديسكو لليسار",
  "Step right": "خطوة لليمين", "Step left": "خطوة لليسار", "Swing right": "تأرجح لليمين", "Swing left": "تأرجح لليسار",
  "Sweep arms right": "حركة الذراعين لليمين", "Sweep arms left": "حركة الذراعين لليسار", "Arm up + step right": "ذراع لفوق + خطوة يمين", "Arm up + step left": "ذراع لفوق + خطوة يسار",
  "Bend knees": "اثني الركبتين", "Arms up, feet wide": "ذراعين لفوق وقدمين واسعة", "Finish": "النهاية", "Rest": "راحة",
  "Raise right arm": "ارفعي ذراعك اليمين", "Raise left arm": "ارفعي ذراعك اليسار", "Extend both arms": "مدّي الذراعين",
  // ready panel
  "Preparing the music… ": "جاري تجهيز الموسيقى… ",
  "🔊 Test music": "🔊 جرّبي الصوت",
  "Music is turned off in ⚙ Settings.": "الموسيقى مطفية من ⚙ الإعدادات.",
  "🎵 Audio file (private test)": "🎵 ملف الصوت (اختبار خاص)",
  "stays on this device": "يبقى على جهازك",
  "Choose your 60-second clip (mp3/m4a/wav). Only the first 60 s are used. It is never uploaded or stored.": "اختاري مقطعك (60 ثانية، mp3/m4a/wav). يُستخدم أول 60 ثانية فقط، وما يُرفع ولا يتخزن.",
  "🎨 Coaches": "🎨 المدربين", "optional outfits": "أزياء اختيارية",
  "👤 Your character": "👤 شخصيتك", "Photo stays on this device only.": "الصورة تبقى على هذا الجهاز فقط.",
  "📸 Retake": "📸 صوّري مرة ثانية", "📸 Take photo": "📸 التقطي صورة", "Reset": "إعادة ضبط",
  "Look straight at the camera…": "انظري مباشرة للكاميرا…",
  "Done! This is your character now. Retake if you don't like it.": "تم! هذي شخصيتك الحين. صوّري مرة ثانية إذا ما عجبتك.",
  "START": "ابدأ",
  // results
  "ACCURACY": "الدقة", "MAX COMBO": "أعلى كومبو", "Play again": "العبي مرة ثانية", "Menu": "القائمة",
  "not detected": "ما انكشفت",
  " complete": " انتهى",
  // rotate
  "Rotate your phone to landscape": "اقلبي الجهاز بالعرض",
  "Dance Motion is a landscape game. Unlock screen rotation if nothing happens.": "اللعبة تشتغل بالعرض. شغّلي تدوير الشاشة إذا ما صار شي.",
  // settings
  "Settings": "الإعدادات", "Close": "إغلاق", "Language": "اللغة",
  "Mirror view": "عرض المرآة", "Skeleton overlay": "إظهار الهيكل", "Timing tolerance": "مدى التوقيت", "Audio offset": "تأخير الصوت", "Music": "الموسيقى",
  "Pose inference cap": "حد سرعة التتبّع", "Pose model": "نموذج التتبّع", "Movement response": "سرعة الاستجابة", "Floor reflections": "انعكاس الأرض",
  "On": "تشغيل", "Off": "إيقاف", "Front": "أمامية", "Back ": "خلفية ", "Max": "أعلى", "Lite": "خفيف", "Full": "كامل", "Heavy (best)": "ثقيل (الأدق)",
  "Smooth": "ناعم", "Balanced": "متوازن", "Fast": "سريع",
  "TV Mode": "وضع التلفزيون", "Go fullscreen": "ملء الشاشة", "Mirror the screen": "اعكسي الشاشة", "Phone placement": "مكان الجوال", "TV layout": "شكل التلفزيون", "Status": "الحالة",
};

/** Translate an English UI string (returns it unchanged in English or when no translation exists). */
export function tr(s: string): string {
  return current === "ar" ? AR[s] ?? s : s;
}
