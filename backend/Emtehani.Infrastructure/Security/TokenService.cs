using System.IdentityModel.Tokens.Jwt; using System.Security.Claims; using System.Text; using Microsoft.IdentityModel.Tokens;
using Emtehani.Application.Abstractions; using Emtehani.Domain.Entities; using Microsoft.Extensions.Configuration;
namespace Emtehani.Infrastructure.Security;
public sealed class TokenService(IConfiguration config):ITokenService {
 public (string Token,DateTime ExpiresAtUtc) Create(AppUser user,DateTime sessionExpiresAtUtc) {
  var now=DateTime.UtcNow;
  var expiry=sessionExpiresAtUtc.Kind==DateTimeKind.Utc?sessionExpiresAtUtc:sessionExpiresAtUtc.ToUniversalTime();
  if(expiry<=now) expiry=now.AddSeconds(30);
  var key=config["Jwt:Key"];
  if(string.IsNullOrWhiteSpace(key)||key.Length<32) throw new InvalidOperationException("Jwt:Key must contain at least 32 characters.");
  var claims=new[]{
   new Claim(ClaimTypes.NameIdentifier,user.Id.ToString()),
   new Claim(ClaimTypes.Name,user.FullName),
   new Claim(ClaimTypes.Email,user.Email),
   new Claim(ClaimTypes.Role,user.Role),
   new Claim("session_exp",new DateTimeOffset(expiry).ToUnixTimeSeconds().ToString(),ClaimValueTypes.Integer64)
  };
  var creds=new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),SecurityAlgorithms.HmacSha256);
  var token=new JwtSecurityToken(config["Jwt:Issuer"]??"Emtehani",config["Jwt:Audience"]??"Emtehani.Client",claims,notBefore:now,expires:expiry,signingCredentials:creds);
  return(new JwtSecurityTokenHandler().WriteToken(token),expiry);
 }
}
