from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from .models import User


class UserSerializer(serializers.ModelSerializer):
    """
    Public serializer for the custom User model.
    """
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'status',
            'stores',
            'is_staff',
            'is_superuser',
            'is_active',
            'last_login',
            'date_joined',
        ]
        read_only_fields = ['id', 'stores', 'is_staff','is_superuser', 'date_joined', 'last_login']


class RegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'},
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=False,
        style={'input_type': 'password'},
    )

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'password',
            'password_confirm',
            'first_name',
            'last_name',
            'status',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        if 'password_confirm' in attrs:
            if attrs['password'] != attrs['password_confirm']:
                raise serializers.ValidationError({"password_confirm": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        return user


class LoginSerializer(serializers.Serializer):
    """
    Serializer to authenticate with either username or email and password.
    """
    username = serializers.CharField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
    )

    def validate(self, attrs):
        username_or_email = attrs.get('username')
        password = attrs.get('password')

        user = None
        # Check if login identifier is an email
        if '@' in username_or_email:
            try:
                user_obj = User.objects.get(email__iexact=username_or_email)
                user = authenticate(
                    request=self.context.get('request'),
                    username=user_obj.username,
                    password=password,
                )
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                user = None

        if not user:
            user = authenticate(
                request=self.context.get('request'),
                username=username_or_email,
                password=password,
            )

        if not user:
            raise serializers.ValidationError(
                {"non_field_errors": ["Unable to log in with provided credentials."]}
            )

        if not user.is_active:
            raise serializers.ValidationError(
                {"non_field_errors": ["User account is disabled."]}
            )

        attrs['user'] = user
        return attrs
