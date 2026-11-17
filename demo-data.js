'use strict';

// Sample prompts loaded the first time the demo opens in each language.
window.PROMPT_VAULT_DEMO_DATA = {
  en: [
    { title: 'Spring Boot REST API', category: 'Coding', ageHours: 2, copyCount: 14, content: 'Generate a Spring Boot REST controller for [entity] with CRUD endpoints, bean validation, global exception handling and JUnit 5 tests.' },
    { title: 'Blog post outline', category: 'Marketing', ageHours: 5, copyCount: 9, content: 'Create a detailed outline for a 1,500-word blog post about [topic]. Include an engaging hook, H2/H3 sections, key points and a call to action.' },
    { title: 'Cold email', category: 'Sales', ageHours: 24, copyCount: 6, content: 'Write a short, friendly cold email to [role] at [company] introducing [product]. Max 120 words, one clear call to action.' },
    { title: 'Midjourney portrait', category: 'Images', ageHours: 48, copyCount: 21, content: 'Cinematic portrait of [subject], soft rim light, 85mm lens, shallow depth of field, muted film palette --ar 4:5 --v 6' },
    { title: 'Professional code review', category: 'Coding', ageHours: 72, copyCount: 11, content: 'Act as a senior developer. Review the following code for maintainability, performance, error handling and security. List the issues ordered by priority, with a suggested fix for each.\n\n[Paste the code here]' },
    { title: 'Summarize a long text', category: 'Writing', ageHours: 120, copyCount: 4, content: 'Summarize the following text in 5 clear key points, then write one sentence that captures the main idea.\n\n[Paste the text here]' }
  ],
  ar: [
    { title: 'واجهة REST بـ Spring Boot', category: 'برمجة', ageHours: 2, copyCount: 14, content: 'أنشئ Controller في Spring Boot لـ [الكيان] مع عمليات CRUD والتحقق من المدخلات ومعالجة الأخطاء واختبارات الوحدة.' },
    { title: 'خطة مقال مدونة', category: 'تسويق', ageHours: 5, copyCount: 9, content: 'اكتب مخططًا تفصيليًا لمقال من 1500 كلمة عن [الموضوع] يتضمن مقدمة جذابة وعناوين فرعية ونقاطًا رئيسية ودعوة لاتخاذ إجراء.' },
    { title: 'رسالة بيع باردة', category: 'مبيعات', ageHours: 24, copyCount: 6, content: 'اكتب رسالة بريد قصيرة وودية إلى [المنصب] في [الشركة] لتقديم [المنتج]. بحد أقصى 120 كلمة ودعوة واحدة واضحة.' },
    { title: 'مراجعة كود احترافية', category: 'برمجة', ageHours: 72, copyCount: 11, content: 'تصرّف كمطور Senior. راجع الكود التالي من حيث: القابلية للصيانة، الأداء، معالجة الأخطاء، والأمان. اذكر المشاكل مرتبة حسب الأولوية مع اقتراح الإصلاح لكل مشكلة.\n\n[ضع الكود هنا]' },
    { title: 'تلخيص نص طويل', category: 'كتابة', ageHours: 120, copyCount: 4, content: 'لخّص النص التالي في 5 نقاط رئيسية واضحة، ثم اكتب جملة واحدة تمثل الفكرة الأساسية.\n\n[ضع النص هنا]' }
  ]
};
