"""
URL configuration for backend project.
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.user.views import UserViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.user.urls')),
    path('api/', include(router.urls)),
    path('api/', include('apps.inventory.urls')),
    path('api-auth/', include('rest_framework.urls')),
]
