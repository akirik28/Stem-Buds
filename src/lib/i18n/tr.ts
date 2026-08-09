/**
 * Central Turkish message catalogue.
 *
 * Turkish is currently the only product language, but every user-facing label
 * lives here (or in page copy) rather than being derived from a database enum
 * value, so nothing English can leak into the interface by accident.
 */

export const roleLabels = {
  regional_director: 'Regional Director',
  vice_president: 'Vice President',
  chapter_head: 'Chapter Head',
  mentor: 'Mentor',
  student: 'Öğrenci',
  advisor_teacher: 'Danışman Öğretmen',
} as const;

export const roleDescriptions = {
  regional_director: 'Tüm platforma erişim',
  vice_president: 'Tüm platforma erişim',
  chapter_head: 'Sorumlu olduğu chapter’ın operasyonel verileri',
  mentor: 'Atandığı grupların verileri',
  student: 'Kendi grubu, ödevi ve katılım geçmişi',
  advisor_teacher: 'Atandığı program(lar)ın verilerini salt okunur görüntüler',
} as const;

export const attendanceLabels = {
  present: 'Katıldı',
  late: 'Geç Katıldı',
  absent: 'Katılmadı',
  excused: 'Mazeretli',
} as const;

export const attendanceIcons = {
  present: '✅',
  late: '🕗',
  absent: '❌',
  excused: '🟡',
} as const;

export const homeworkStatusLabels = {
  pending: 'Bekliyor',
  done: 'Yaptı',
  not_done: 'Yapmadı',
  excused: 'Mazeretli',
} as const;

export const homeworkStatusIcons = {
  pending: '⏳',
  done: '✅',
  not_done: '❌',
  excused: '🟡',
} as const;

export const projectHealthLabels = {
  on_track: 'Yolunda',
  attention: 'Dikkat Gerekiyor',
  delayed: 'Gecikiyor',
} as const;

export const projectHealthIcons = {
  on_track: '🟢',
  attention: '🟡',
  delayed: '🔴',
} as const;

export const milestoneStatusLabels = {
  planned: 'Planlandı',
  in_progress: 'Devam ediyor',
  completed: 'Tamamlandı',
} as const;

export const alertStatusLabels = {
  new: 'Yeni',
  investigating: 'İnceleniyor',
  resolved: 'Çözüldü',
  closed: 'Kapatıldı',
} as const;

export const alertSeverityLabels = {
  info: 'Bilgi',
  yellow: 'Dikkat',
  red: 'Aksiyon gerekiyor',
} as const;

export const alertCategoryLabels = {
  missing_weekly_record: 'Eksik haftalık kayıt',
  attendance_risk: 'Katılım riski',
  homework_risk: 'Ödev riski',
  project_stale: 'Proje güncellenmedi',
  project_blocked: 'Proje engeli',
  milestone_overdue: 'Milestone gecikti',
} as const;

export const alertTabLabels = {
  weekly: 'Haftalık Takip',
  project: 'Proje & Grup Sağlığı',
  feedback: 'Geri Bildirim & Şikâyetler',
} as const;

export const complaintStatusLabels = {
  new: 'Yeni',
  investigating: 'İnceleniyor',
  resolved: 'Sonuçlandırıldı',
} as const;

export const complaintCategoryLabels = {
  about_mentor: 'Mentor ile ilgili',
  group_problem: 'Grup içi problem',
  student_behaviour: 'Öğrenci davranışı',
  inappropriate_behaviour: 'Uygunsuz davranış',
  communication_problem: 'İletişim problemi',
  about_chapter_head: 'Chapter Head ile ilgili',
  program_organisation: 'Program / organizasyon',
  other: 'Diğer',
} as const;

export const feedbackCategoryLabels = {
  mentor: 'Mentor',
  group: 'Grup',
  program: 'Program',
  weekly_sessions: 'Haftalık Çalışmalar',
  platform: 'Platform',
  other: 'Diğer',
} as const;

export const channelTypeLabels = {
  presidency: 'BAŞKANLIK',
  chapter_management: 'CHAPTER YÖNETİMİ',
  chapter_mentors: 'Mentor Ekibi',
} as const;

export const weeklySessionStateLabels = {
  scheduled: 'Planlandı',
  cancelled: 'İptal edildi',
  holiday: 'Tatil',
} as const;

export const meetingAttendanceLabels = {
  present: 'Katıldı',
  absent: 'Katılmadı',
  excused: 'Mazeretli',
} as const;

export const contactReasonLabels = {
  school_representative: 'Okul/Chapter temsilcisiyim',
  mentor_candidate: 'Mentor olmak istiyorum',
  student: 'Öğrenciyim',
  information: 'Bilgi almak istiyorum',
  other: 'Diğer',
} as const;

export type ContactReason = keyof typeof contactReasonLabels;

export const disciplineLabels = {
  bio: 'Biyoloji',
  chem: 'Kimya',
  cs: 'Bilgisayar Bilimleri',
  math: 'Matematik',
  eng: 'Mühendislik',
  social: 'Sosyal Bilimler',
} as const;

/** Canonical group-code prefixes. These stay unchanged by design. */
export const disciplineCodes = {
  bio: 'Bio',
  chem: 'Chem',
  cs: 'CS',
  math: 'Math',
  eng: 'Engineering',
  social: 'Social Sciences',
} as const;

export type DisciplineKey = keyof typeof disciplineLabels;

/**
 * Turkish verb phrase for each audit-log action code, meant to read naturally
 * right after an actor's name (e.g. "{actorName} {label}"). Keyed by the raw
 * string stored in `audit_logs.action` (see `AUDIT_ACTIONS` in
 * `src/server/services/audit.ts`) rather than importing that module's type,
 * since this file is also pulled into client bundles.
 */
export const auditActionLabels: Record<string, string> = {
  'user.created': 'yeni kullanıcı oluşturdu',
  'user.updated': 'kullanıcı bilgilerini güncelledi',
  'user.deactivated': 'kullanıcıyı pasifleştirdi',
  'user.reactivated': 'kullanıcıyı yeniden aktifleştirdi',
  'user.role_changed': 'kullanıcının rolünü değiştirdi',
  'user.password_reset_issued': 'kullanıcı için geçici şifre oluşturdu',
  'user.password_changed': 'kendi şifresini değiştirdi',
  'user.deleted': 'kullanıcıyı sildi',
  'chapter.created': 'chapter oluşturdu',
  'chapter.updated': 'chapter bilgilerini güncelledi',
  'chapter.published': 'chapter’ı sitede yayınladı',
  'chapter.archived': 'chapter’ı pasifleştirdi',
  'chapter.reactivated': 'chapter’ı yeniden aktifleştirdi',
  'chapter.deleted': 'chapter’ı sildi',
  'group.created': 'grup oluşturdu',
  'group.updated': 'grup bilgilerini güncelledi',
  'group.membership_changed': 'grup üyeliğini değiştirdi',
  'group.mentor_assigned': 'grubun mentorunu değiştirdi',
  'group.archived': 'grubu pasifleştirdi',
  'group.reactivated': 'grubu yeniden aktifleştirdi',
  'group.deleted': 'grubu sildi',
  'attendance.edited': 'katılım kaydını düzenledi',
  'homework.edited': 'ödevi düzenledi',
  'homework.status_edited': 'ödev durumunu güncelledi',
  'homework.assignment_deleted': 'ödev atamasını sildi',
  'weekly_record.approved': 'haftalık kaydı onayladı',
  'weekly_record.edited': 'haftalık kaydı düzenledi',
  'project.created': 'proje oluşturdu',
  'project.updated': 'proje bilgilerini güncelledi',
  'project.status_edited': 'proje durumunu güncelledi',
  'milestone.created': 'milestone oluşturdu',
  'milestone.status_changed': 'milestone durumunu değiştirdi',
  'milestone.deleted': 'milestone sildi',
  'complaint.created': 'şikâyet bildirdi',
  'complaint.status_changed': 'şikâyet durumunu güncelledi',
  'complaint.assigned': 'şikâyeti atadı',
  'feedback.submitted': 'geri bildirim gönderdi',
  'feedback.reviewed': 'geri bildirimi incelendi olarak işaretledi',
  'feedback_cycle.responded': 'geri bildirim anketini yanıtladı',
  'message.deleted': 'kanal mesajını sildi',
  'mentor_meeting.created': 'mentor toplantısı oluşturdu',
  'highlight.updated': 'öne çıkan içeriği kaydetti',
  'highlight.deleted': 'öne çıkan içeriği sildi',
  'news.created': 'haber oluşturdu',
  'news.updated': 'haberi güncelledi',
  'news.published': 'haberi yayınladı',
  'news.unpublished': 'haberi yayından kaldırdı',
  'news.deleted': 'haberi sildi',
  'leadership.created': 'yönetim profili oluşturdu',
  'leadership.updated': 'yönetim profilini güncelledi',
  'leadership.published': 'yönetim profilini yayınladı',
  'leadership.deleted': 'yönetim profilini sildi',
  'public_media.uploaded': 'site için görsel yükledi',
  'public_media.deleted': 'görseli sildi',
  'contact_message.handled': 'iletişim mesajını işlendi olarak işaretledi',
  'export.generated': 'dışa aktarma (Excel) oluşturdu',
  'program.schedule_changed': 'program takvimini güncelledi',
  'program.thresholds_changed': 'uyarı eşiklerini güncelledi',
  'academic_year.activated': 'akademik yılı aktifleştirdi',
  'academic_year.deleted': 'akademik yılı sildi',
  'bootstrap.executive_created': 'ilk yönetici hesabını oluşturdu',
  'advisor.programs_changed': 'danışman öğretmenin program yetkisini değiştirdi',
  'weekly_session.cancelled': 'haftalık oturumu iptal etti',
  'weekly_session.deleted': 'haftalık oturumu sildi',
  'management_alert.status_changed': 'uyarı durumunu güncelledi',
  'ai_insight.generated': 'AI özeti oluşturdu',
};

export const weekdayLabels = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

export const messages = {
  common: {
    save: 'Kaydet',
    cancel: 'Vazgeç',
    delete: 'Sil',
    edit: 'Düzenle',
    view: 'Görüntüle',
    close: 'Kapat',
    back: 'Geri',
    search: 'Ara',
    filter: 'Filtrele',
    loading: 'Yükleniyor…',
    saving: 'Kaydediliyor…',
    saved: 'Kaydedildi.',
    confirm: 'Onayla',
    required: 'Zorunlu alan',
    optional: 'Opsiyonel',
    yes: 'Evet',
    no: 'Hayır',
    all: 'Tümü',
    unknownError: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
  },
  auth: {
    loginTitle: 'Platforma Giriş',
    username: 'Kullanıcı adı',
    password: 'Şifre',
    submit: 'Giriş yap',
    invalidCredentials: 'Kullanıcı adı veya şifre hatalı.',
    accountInactive: 'Hesabınız pasif durumda. Lütfen yönetim ile iletişime geçin.',
    accountLocked: 'Çok fazla hatalı deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
    logout: 'Çıkış yap',
    mustChangePasswordTitle: 'Şifreni belirle',
    mustChangePasswordDescription:
      'Güvenliğin için geçici şifreni kalıcı bir şifreyle değiştirmen gerekiyor.',
    currentPassword: 'Mevcut şifre',
    newPassword: 'Yeni şifre',
    newPasswordRepeat: 'Yeni şifre (tekrar)',
    passwordsDoNotMatch: 'Şifreler birbiriyle aynı değil.',
    passwordTooShort: 'Şifre en az 10 karakter olmalı.',
    passwordTooLong: 'Şifre en fazla 128 karakter olabilir.',
    passwordNeedsLetter: 'Şifre en az bir harf içermeli.',
    passwordNeedsNumber: 'Şifre en az bir rakam içermeli.',
    passwordSameAsUsername: 'Şifre kullanıcı adını içeremez.',
    passwordChanged: 'Şifren güncellendi.',
    noPublicRegistration:
      'Bu platformda kayıt olma özelliği bulunmuyor. Hesaplar yalnızca üst yönetim tarafından oluşturulur.',
  },
  validation: {
    requiredField: 'Bu alan zorunludur.',
    tooLong: 'Girilen değer çok uzun.',
    invalidEmail: 'Geçerli bir e-posta adresi girin.',
    invalidUrl: 'Geçerli bir bağlantı adresi girin.',
    invalidNumber: 'Geçerli bir sayı girin.',
    invalidSelection: 'Geçerli bir seçim yapın.',
    invalidDate: 'Geçerli bir tarih girin.',
  },
  empty: {
    noWeeklyRecord: 'Bu hafta henüz çalışma kaydı bulunmuyor.',
    scheduleNotSet: 'Haftalık çalışma saati henüz belirlenmedi.',
    noFeedback: 'Henüz feedback bulunmuyor.',
    noComplaints: 'Görüntülemeye yetkili olduğunuz bildirim bulunmuyor.',
    noAlerts: 'Şu anda dikkat gerektiren bir konu bulunmuyor.',
    noGroups: 'Henüz grup oluşturulmadı.',
    noProjects: 'Henüz proje kaydı bulunmuyor.',
    noMessages: 'Bu kanalda henüz mesaj yok.',
    noMeetings: 'Henüz mentor toplantısı kaydı bulunmuyor.',
    noNews: 'Henüz haber yayınlanmadı.',
    noHomework: 'Bu hafta ödev yok.',
    noNotifications: 'Yeni bildiriminiz yok.',
    noAuditRecords: 'Seçilen kriterlere uygun kayıt bulunamadı.',
  },
  errors: {
    forbidden: 'Bu içeriği görüntüleme yetkiniz bulunmuyor.',
    notFound: 'Aradığınız kayıt bulunamadı.',
    unauthenticated: 'Bu işlem için giriş yapmanız gerekiyor.',
    rateLimited: 'Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.',
  },
} as const;
