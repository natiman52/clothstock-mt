from rest_framework import generics, status, viewsets, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from .models import User
from .serializers import UserSerializer, RegisterSerializer, LoginSerializer


class RegisterView(generics.CreateAPIView):
    """
    Register a new user and return user info along with DRF auth token.
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        user_data = UserSerializer(user, context=self.get_serializer_context()).data
        return Response(
            {
                "token": token.key,
                "user": user_data,
                "message": "User registered successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    Authenticate user with username/email and password, returning auth token and user details.
    """
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, _ = Token.objects.get_or_create(user=user)
        user_data = UserSerializer(user).data
        return Response(
            {
                "token": token.key,
                "user": user_data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    Invalidate current authenticated user's auth token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            request.user.auth_token.delete()
        except (AttributeError, Token.DoesNotExist):
            pass
        return Response(
            {"detail": "Successfully logged out."},
            status=status.HTTP_200_OK,
        )


class CurrentUserView(generics.RetrieveUpdateAPIView):
    """
    Retrieve or update currently authenticated user's profile.
    Requires 'Authorization: Token <token>' header.
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class CustomObtainAuthToken(ObtainAuthToken):
    """
    Standard DRF token endpoint returning token and serialized user info.
    """
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data
        })


class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoint for staff/user management.
    List/retrieve: any authenticated user.
    Create/update/delete: admin only.
    GET  /api/users/          – list all users (supports ?search=, ?is_staff=, ?is_active=,?status=)
    GET  /api/users/:id/      – retrieve single user
    POST /api/users/          – create user (admin)
    PATCH/PUT /api/users/:id/ – update user (admin)
    DELETE /api/users/:id/    – delete user (admin)
    """
    serializer_class = UserSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['date_joined', 'last_login', 'username']
    ordering = ['-date_joined']

    def get_queryset(self):
        qs = User.objects.all()
        # Filter by is_staff
        is_staff = self.request.query_params.get('is_staff')
        if is_staff is not None:
            qs = qs.filter(is_staff=is_staff.lower() in ('true', '1', 'yes'))
        # Filter by is_active
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1', 'yes'))
        # Filter by is_superuser
        is_superuser = self.request.query_params.get('is_superuser')
        if is_superuser is not None:
            qs = qs.filter(is_superuser=is_superuser.lower() in ('true', '1', 'yes'))
        status = self.request.query_params.get("status")
        if status == User.Status.OWNER.lower:
            qs = qs.filter(status=User.Status.OWNER)
        elif status == User.Status.WORKER.lower:
            qs = qs.filter(status=User.Status.WORKER)
        return qs

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def create(self, request, *args, **kwargs):
        """Create user via RegisterSerializer to handle password hashing."""
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

