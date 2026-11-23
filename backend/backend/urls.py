"""
URL configuration for backend project.
"""
from django.contrib import admin
from django.urls import path, include
from apps.user.urls import router

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.user.urls')),
    path('api/', include('apps.inventory.urls')),
    path('api-auth/', include('rest_framework.urls')),
]
