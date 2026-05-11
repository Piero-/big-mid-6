FROM node:20-alpine AS client
WORKDIR /src/ClientApp
COPY ClientApp/package*.json ./
RUN npm ci
COPY ClientApp/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY server/TourVirtual.Api/*.csproj server/TourVirtual.Api/
RUN dotnet restore server/TourVirtual.Api/TourVirtual.Api.csproj
COPY server/TourVirtual.Api/ server/TourVirtual.Api/
COPY --from=client /src/ClientApp/dist server/TourVirtual.Api/wwwroot
RUN dotnet publish server/TourVirtual.Api/TourVirtual.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "TourVirtual.Api.dll"]
