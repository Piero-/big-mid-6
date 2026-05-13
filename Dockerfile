FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS build
WORKDIR /src

COPY server/TourVirtual.Api/*.csproj server/TourVirtual.Api/
RUN dotnet restore server/TourVirtual.Api/TourVirtual.Api.csproj

COPY server/TourVirtual.Api/ server/TourVirtual.Api/
RUN dotnet publish server/TourVirtual.Api/TourVirtual.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENV DOTNET_EnableDiagnostics=0

EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "TourVirtual.Api.dll"]
