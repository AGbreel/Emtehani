using Emtehani.Domain.Entities;
namespace Emtehani.Application.Abstractions;
public interface ITokenService
{
    /// <summary>
    /// Creates a JWT that can never outlive the fixed login session. The session expiry
    /// is passed explicitly so refresh-token rotation cannot extend a session.
    /// </summary>
    (string Token, DateTime ExpiresAtUtc) Create(AppUser user, DateTime sessionExpiresAtUtc);
}
