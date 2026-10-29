using Emtehani.Domain.Entities;
namespace Emtehani.Application.Abstractions;
public interface ITokenService { (string Token,DateTime ExpiresAtUtc) Create(AppUser user); }
