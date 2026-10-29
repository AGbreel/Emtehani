using Microsoft.EntityFrameworkCore; using Emtehani.Domain.Entities;
namespace Emtehani.Infrastructure.Persistence;
public sealed class AppDbContext(DbContextOptions<AppDbContext> options):DbContext(options) {
 public DbSet<AppUser> Users=>Set<AppUser>(); public DbSet<Exam> Exams=>Set<Exam>(); public DbSet<Question> Questions=>Set<Question>(); public DbSet<ExamParticipant> ExamParticipants=>Set<ExamParticipant>();
 public DbSet<Submission> Submissions=>Set<Submission>(); public DbSet<SubmissionAnswer> Answers=>Set<SubmissionAnswer>(); public DbSet<AuditEvent> AuditEvents=>Set<AuditEvent>(); public DbSet<TeacherStudentRequest> TeacherStudentRequests=>Set<TeacherStudentRequest>();
 public DbSet<TeacherStudentExamBan> TeacherStudentExamBans=>Set<TeacherStudentExamBan>();
 protected override void OnModelCreating(ModelBuilder b) {
  b.Entity<AppUser>().HasIndex(x=>x.Email).IsUnique();
  b.Entity<AppUser>().Property(x=>x.StudentCode).HasMaxLength(12);
  b.Entity<AppUser>().Property(x=>x.Stage).HasMaxLength(32);
  b.Entity<AppUser>().Property(x=>x.Grade).HasMaxLength(64);
  b.Entity<Exam>().Property(x=>x.Stage).HasMaxLength(32);
  b.Entity<Exam>().Property(x=>x.Grade).HasMaxLength(64);
  var studentCodeFilter = Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true ? "\"StudentCode\" <> ''" : "[StudentCode] <> ''";
  b.Entity<AppUser>().HasIndex(x=>x.StudentCode).IsUnique().HasDatabaseName("IX_Users_StudentCode").HasFilter(studentCodeFilter);
  b.Entity<Exam>().HasMany(x=>x.Questions).WithOne(x=>x.Exam).HasForeignKey(x=>x.ExamId).OnDelete(DeleteBehavior.Cascade);
  b.Entity<Exam>().HasMany(x=>x.Participants).WithOne(x=>x.Exam).HasForeignKey(x=>x.ExamId).OnDelete(DeleteBehavior.Cascade);
  b.Entity<ExamParticipant>().HasOne(x=>x.Student).WithMany().HasForeignKey(x=>x.StudentId).OnDelete(DeleteBehavior.Cascade);
  b.Entity<ExamParticipant>().HasIndex(x=>new{x.ExamId,x.StudentId}).IsUnique();
  var participantCodeFilter = Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true ? "\"Code\" <> ''" : "[Code] <> ''";
  b.Entity<ExamParticipant>().HasIndex(x=>x.Code).IsUnique().HasFilter(participantCodeFilter);
  b.Entity<Exam>().HasIndex(x=>x.JoinCode).IsUnique();
  b.Entity<Submission>().HasOne(x=>x.Student).WithMany().HasForeignKey(x=>x.StudentId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Submission>().HasOne(x=>x.Exam).WithMany().HasForeignKey(x=>x.ExamId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Submission>().HasMany(x=>x.Answers).WithOne(x=>x.Submission).HasForeignKey(x=>x.SubmissionId).OnDelete(DeleteBehavior.Cascade);
  var inProgressFilter = Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true ? "\"Status\" = 'InProgress'" : "[Status] = 'InProgress'";
  b.Entity<Submission>().HasIndex(x=>new{x.ExamId,x.StudentId}).HasDatabaseName("IX_Submissions_Exam_Student_InProgress").HasFilter(inProgressFilter).IsUnique();
  b.Entity<SubmissionAnswer>().HasOne(x=>x.Question).WithMany().HasForeignKey(x=>x.QuestionId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<SubmissionAnswer>().HasIndex(x=>new{x.SubmissionId,x.QuestionId}).IsUnique();
  b.Entity<TeacherStudentRequest>().HasOne(x=>x.Teacher).WithMany().HasForeignKey(x=>x.TeacherId).OnDelete(DeleteBehavior.Cascade);
  b.Entity<TeacherStudentRequest>().HasOne(x=>x.Student).WithMany().HasForeignKey(x=>x.StudentId).OnDelete(DeleteBehavior.NoAction);
  b.Entity<TeacherStudentRequest>().HasIndex(x=>new{x.TeacherId,x.StudentId}).IsUnique();
  b.Entity<TeacherStudentRequest>().HasIndex(x=>x.StudentId);
  b.Entity<TeacherStudentExamBan>().HasOne(x=>x.Exam).WithMany().HasForeignKey(x=>x.ExamId).OnDelete(DeleteBehavior.Cascade);
  b.Entity<TeacherStudentExamBan>().HasOne<AppUser>().WithMany().HasForeignKey(x=>x.TeacherId).OnDelete(DeleteBehavior.Cascade);
  b.Entity<TeacherStudentExamBan>().HasOne<AppUser>().WithMany().HasForeignKey(x=>x.StudentId).OnDelete(DeleteBehavior.NoAction);
  b.Entity<TeacherStudentExamBan>().HasIndex(x=>new{x.ExamId,x.StudentId}).IsUnique().HasDatabaseName("IX_TeacherStudentExamBans_ExamId_StudentId");
  b.Entity<TeacherStudentExamBan>().HasIndex(x=>new{x.TeacherId,x.StudentId}).HasDatabaseName("IX_TeacherStudentExamBans_TeacherId_StudentId");
 }
}
